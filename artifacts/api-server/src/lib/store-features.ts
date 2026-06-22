import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  canUseFeature,
  db,
  storeMembersTable,
  userEntitlementsTable,
} from "@workspace/db";
import { resolveCurrentActor } from "../middleware/rbac";

export type StoreFeature = "delivery" | "fiscal";

export type StoreFeatureAccess = {
  storeId: number;
  feature: StoreFeature;
  allowed: boolean;
  plan: string | null;
  status: string | null;
  billingUserId: number | null;
  code: "PLAN_UPGRADE_REQUIRED" | "SUBSCRIPTION_INACTIVE" | null;
};

const activeEntitlementStatuses = new Set(["active", "trialing"]);

export function evaluateStoreFeatureAccess(
  storeId: number,
  feature: StoreFeature,
  entitlement: {
    userId: number | null;
    plan: string | null;
    status: string | null;
  } | null,
): StoreFeatureAccess {
  const plan = entitlement?.plan ?? null;
  const status = entitlement?.status ?? null;
  const includedInPlan = canUseFeature(plan, feature);
  const subscriptionActive = Boolean(
    status && activeEntitlementStatuses.has(status),
  );
  const allowed = includedInPlan && subscriptionActive;

  let code: StoreFeatureAccess["code"] = null;
  if (!includedInPlan) code = "PLAN_UPGRADE_REQUIRED";
  else if (!subscriptionActive) code = "SUBSCRIPTION_INACTIVE";

  return {
    storeId,
    feature,
    allowed,
    plan,
    status,
    billingUserId: entitlement?.userId ?? null,
    code,
  };
}

/**
 * Resolve os recursos da loja pela assinatura do Max Control principal.
 * Funcionários usam os recursos contratados pela loja e não precisam possuir
 * uma assinatura individual.
 */
export async function getStoreFeatureAccess(
  storeId: number,
  feature: StoreFeature,
): Promise<StoreFeatureAccess> {
  const [billingOwner] = await db
    .select({
      userId: storeMembersTable.userId,
      plan: userEntitlementsTable.plan,
      status: userEntitlementsTable.status,
    })
    .from(storeMembersTable)
    .leftJoin(
      userEntitlementsTable,
      eq(userEntitlementsTable.userId, storeMembersTable.userId),
    )
    .where(
      and(
        eq(storeMembersTable.storeId, storeId),
        eq(storeMembersTable.active, true),
        eq(storeMembersTable.role, "max_control"),
      ),
    )
    .orderBy(desc(storeMembersTable.isDefault), storeMembersTable.id)
    .limit(1);

  return evaluateStoreFeatureAccess(storeId, feature, billingOwner ?? null);
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
      const access = await getStoreFeatureAccess(actor.storeId, feature);

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
