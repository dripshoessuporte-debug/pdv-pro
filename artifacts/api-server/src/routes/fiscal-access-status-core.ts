import type { Request } from "express";
import type { AuthenticatedContext } from "../lib/auth";
import type { StoreFeatureAccess } from "../lib/store-features";

type FiscalAccessDiagnosticCode =
  | "AUTH_REQUIRED"
  | "AUTH_CONTEXT_FAILED"
  | "CURRENT_STORE_REQUIRED"
  | "PERMISSION_DENIED"
  | "PLAN_UPGRADE_REQUIRED"
  | "SUBSCRIPTION_INACTIVE"
  | "FEATURE_ACCESS_QUERY_FAILED"
  | "FEATURE_ACCESS_CHECK_FAILED"
  | null;

type FiscalAccessDiagnosticStage =
  | "resolve_context"
  | "feature_access_query"
  | null;

export type FiscalAccessStatusBody = {
  feature: "fiscal";
  allowed: boolean;
  code: FiscalAccessDiagnosticCode;
  error: string | null;
  plan: string | null;
  status: string | null;
  billingUserId?: number | null;
  diagnosticStage?: FiscalAccessDiagnosticStage;
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
  getCurrentUserFiscalAccess?: (options: {
    storeId: number;
    userId: number;
  }) => Promise<StoreFeatureAccess>;
};

const unavailableBody = (
  code: Exclude<FiscalAccessDiagnosticCode, null>,
  error: string,
  diagnosticStage: FiscalAccessDiagnosticStage = null,
): FiscalAccessStatusBody => ({
  feature: "fiscal",
  allowed: false,
  code,
  error,
  plan: null,
  status: null,
  ...(diagnosticStage ? { diagnosticStage } : {}),
});

function safeErrorDetails(error: unknown) {
  const name = error instanceof Error ? error.name : typeof error;
  const rawMessage = error instanceof Error ? error.message : String(error);
  const compact = rawMessage.replace(/[\r\n\t]+/g, " ").slice(0, 160);
  const safeMessage =
    /select|insert|update|delete|cookie|token|authorization|password|senha|stack|certificate|certificado|csc/i.test(
      compact,
    )
      ? "Internal diagnostic error."
      : compact;
  return {
    errorName: name.slice(0, 80),
    safeMessage,
  };
}

function logFiscalAccessError(
  code: Exclude<FiscalAccessDiagnosticCode, null>,
  diagnosticStage: Exclude<FiscalAccessDiagnosticStage, null>,
  error: unknown,
  context?: AuthenticatedContext | null,
): void {
  const { errorName, safeMessage } = safeErrorDetails(error);
  console.error("[fiscal/access-status]", {
    code,
    diagnosticStage,
    errorName,
    safeMessage,
    currentStoreId: context?.currentStore?.id,
    userId: context?.user?.id,
  });
}

export async function resolveFiscalAccessStatus(
  req: Request,
  dependencies: FiscalAccessStatusDependencies,
): Promise<FiscalAccessStatusResult> {
  let context: AuthenticatedContext | null;
  try {
    context = await dependencies.resolveContext(req);
  } catch (error) {
    logFiscalAccessError("AUTH_CONTEXT_FAILED", "resolve_context", error);
    return {
      status: 200,
      body: unavailableBody(
        "AUTH_CONTEXT_FAILED",
        "Não foi possível validar sua sessão. Faça login novamente.",
        "resolve_context",
      ),
    };
  }

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

  let access: StoreFeatureAccess;
  try {
    access = await dependencies.getFeatureAccess({
      storeId: context.currentStore.id,
      feature: "fiscal",
      preferredUserId: context.user.id,
    });
  } catch (error) {
    logFiscalAccessError(
      "FEATURE_ACCESS_QUERY_FAILED",
      "feature_access_query",
      error,
      context,
    );
    if (dependencies.getCurrentUserFiscalAccess) {
      try {
        access = await dependencies.getCurrentUserFiscalAccess({
          storeId: context.currentStore.id,
          userId: context.user.id,
        });
      } catch (fallbackError) {
        logFiscalAccessError(
          "FEATURE_ACCESS_QUERY_FAILED",
          "feature_access_query",
          fallbackError,
          context,
        );
        return {
          status: 200,
          body: unavailableBody(
            "FEATURE_ACCESS_QUERY_FAILED",
            "Não foi possível consultar a assinatura da loja.",
            "feature_access_query",
          ),
        };
      }
    } else {
      return {
        status: 200,
        body: unavailableBody(
          "FEATURE_ACCESS_QUERY_FAILED",
          "Não foi possível consultar a assinatura da loja.",
          "feature_access_query",
        ),
      };
    }
  }

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
}
