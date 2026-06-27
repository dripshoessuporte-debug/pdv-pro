import type { Request } from "express";
import type { AuthenticatedContext } from "../lib/auth";
import type { StoreFeatureAccess } from "../lib/store-features";

type FiscalAccessDiagnosticCode =
  | "AUTH_REQUIRED"
  | "CURRENT_STORE_REQUIRED"
  | "PERMISSION_DENIED"
  | "PLAN_UPGRADE_REQUIRED"
  | "SUBSCRIPTION_INACTIVE"
  | "FEATURE_ACCESS_CHECK_FAILED"
  | null;

export type FiscalAccessStatusBody = {
  feature: "fiscal";
  allowed: boolean;
  code: FiscalAccessDiagnosticCode;
  error: string | null;
  plan: string | null;
  status: string | null;
  billingUserId?: number | null;
};

export type FiscalAccessStatusResult = {
  status: number;
  body: FiscalAccessStatusBody;
};

export type FiscalAccessStatusDependencies = {
  resolveContext: (req: Request) => Promise<AuthenticatedContext | null>;
  getFeatureAccess: (options: {
    storeId: number;
    feature: "fiscal";
    preferredUserId?: number | null;
  }) => Promise<StoreFeatureAccess>;
};

const unavailableBody = (
  code: Exclude<FiscalAccessDiagnosticCode, null>,
  error: string,
): FiscalAccessStatusBody => ({
  feature: "fiscal",
  allowed: false,
  code,
  error,
  plan: null,
  status: null,
});

export async function resolveFiscalAccessStatus(
  req: Request,
  dependencies: FiscalAccessStatusDependencies,
): Promise<FiscalAccessStatusResult> {
  try {
    const context = await dependencies.resolveContext(req);
    if (!context) {
      return {
        status: 401,
        body: unavailableBody(
          "AUTH_REQUIRED",
          "Faça login para acessar o módulo fiscal.",
        ),
      };
    }
    if (!context.currentStore) {
      return {
        status: 409,
        body: unavailableBody(
          "CURRENT_STORE_REQUIRED",
          "Selecione uma loja ativa para acessar o módulo fiscal.",
        ),
      };
    }
    if (context.currentStore.role !== "max_control") {
      return {
        status: 403,
        body: unavailableBody(
          "PERMISSION_DENIED",
          "Somente usuários Max Control podem configurar o Fiscal.",
        ),
      };
    }
    const access = await dependencies.getFeatureAccess({
      storeId: context.currentStore.id,
      feature: "fiscal",
      preferredUserId: context.user.id,
    });
    if (access.allowed) {
      return {
        status: 200,
        body: {
          feature: "fiscal",
          allowed: true,
          code: null,
          error: null,
          plan: access.plan,
          status: access.status,
          billingUserId: access.billingUserId,
        },
      };
    }
    const code = access.code ?? "PLAN_UPGRADE_REQUIRED";
    return {
      status: 200,
      body: {
        feature: "fiscal",
        allowed: false,
        code,
        error:
          code === "SUBSCRIPTION_INACTIVE"
            ? "O plano PRO foi encontrado, mas a assinatura não está ativa."
            : "Esta loja ainda não possui o plano PRO.",
        plan: access.plan,
        status: access.status,
        billingUserId: access.billingUserId,
      },
    };
  } catch {
    return {
      status: 200,
      body: unavailableBody(
        "FEATURE_ACCESS_CHECK_FAILED",
        "Não foi possível verificar a assinatura da loja.",
      ),
    };
  }
}
