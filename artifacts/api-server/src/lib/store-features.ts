import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  storeMembersTable,
  userEntitlementsTable,
  usersTable,
} from "@workspace/db";
import { resolveCurrentActor } from "../middleware/rbac";

import {
  evaluateStoreFeatureAccess,
  type StoreFeature,
  type StoreFeatureAccess,
} from "./store-feature-evaluator";
export { evaluateStoreFeatureAccess, type StoreFeature, type StoreFeatureAccess } from "./store-feature-evaluator";

export type StoreFeatureAccessOptions = {
  storeId: number;
  feature: StoreFeature;
  preferredUserId?: number | null;
};

/**
 * Resolve os recursos contratados no contexto da loja, avaliando todos os
 * Max Control ativos da loja. Funcionários usam recursos contratados pela loja
 * e não precisam possuir assinatura individual.
 */
export async function getStoreFeatureAccess(
  storeIdOrOptions: number | StoreFeatureAccessOptions,
  featureArg?: StoreFeature,
): Promise<StoreFeatureAccess> {
  const options =
    typeof storeIdOrOptions === "number"
      ? { storeId: storeIdOrOptions, feature: featureArg as StoreFeature }
      : storeIdOrOptions;

  const billingCandidates = await db
    .select({
      userId: storeMembersTable.userId,
      plan: userEntitlementsTable.plan,
      status: userEntitlementsTable.status,
      isDefault: storeMembersTable.isDefault,
      memberId: storeMembersTable.id,
    })
    .from(storeMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, storeMembersTable.userId))
    .leftJoin(
      userEntitlementsTable,
      eq(userEntitlementsTable.userId, storeMembersTable.userId),
    )
    .where(
      and(
        eq(storeMembersTable.storeId, options.storeId),
        eq(storeMembersTable.active, true),
        eq(storeMembersTable.role, "max_control"),
        eq(usersTable.status, "active"),
      ),
    )
    .orderBy(desc(storeMembersTable.isDefault), storeMembersTable.id);

  return evaluateStoreFeatureAccess(
    options.storeId,
    options.feature,
    billingCandidates,
    options.preferredUserId,
  );
}

function accessDeniedResponse(res: Response, access: StoreFeatureAccess): void {
  if (access.code === "SUBSCRIPTION_INACTIVE") {
    res.status(403).json({
      error:
        "O plano Gestor Max PRO desta loja não está ativo para novas operações fiscais.",
      code: access.code,
      requiredPlan: "pro",
      plan: access.plan,
      status: access.status,
    });
    return;
  }

  res.status(403).json({
    error: "O módulo fiscal está disponível somente no Gestor Max PRO.",
    code: "PLAN_UPGRADE_REQUIRED",
    requiredPlan: "pro",
    plan: access.plan,
    status: access.status,
  });
}

export function requireStoreFeature(feature: StoreFeature): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = await resolveCurrentActor(req);
      const access = await getStoreFeatureAccess({
        storeId: actor.storeId,
        feature,
        preferredUserId: actor.id,
      });

      if (!access.allowed) {
        accessDeniedResponse(res, access);
        return;
      }

      res.locals.storeFeatureAccess = access;
      next();
    } catch (error) {
      const status = (error as Error & { status?: number }).status ?? 500;
      res.status(status).json({
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível validar o acesso ao recurso.",
        code: "FEATURE_ACCESS_CHECK_FAILED",
      });
    }
  };
}
