export const CERTIFICATE_VALIDATION_ERROR = "CERTIFICATE_VALIDATION_ERROR" as const;
export const CSC_VALIDATION_ERROR = "CSC_VALIDATION_ERROR" as const;
export const COMPANY_NOT_LINKED = "COMPANY_NOT_LINKED" as const;
export const STORE_CREDENTIAL_NOT_CONFIGURED = "STORE_CREDENTIAL_NOT_CONFIGURED" as const;
export const FOCUS_AUTHENTICATION_ERROR = "FOCUS_AUTHENTICATION_ERROR" as const;
export const FOCUS_VALIDATION_ERROR = "FOCUS_VALIDATION_ERROR" as const;
export const FOCUS_TIMEOUT = "FOCUS_TIMEOUT" as const;
export const FOCUS_UNAVAILABLE = "FOCUS_UNAVAILABLE" as const;
export const LOCAL_PERSISTENCE_ERROR = "LOCAL_PERSISTENCE_ERROR" as const;
export const FOCUS_APPLIED_LOCAL_SYNC_FAILED = "FOCUS_APPLIED_LOCAL_SYNC_FAILED" as const;

export type FocusSetupErrorCode =
  | typeof CERTIFICATE_VALIDATION_ERROR
  | typeof CSC_VALIDATION_ERROR
  | typeof COMPANY_NOT_LINKED
  | typeof STORE_CREDENTIAL_NOT_CONFIGURED
  | typeof FOCUS_AUTHENTICATION_ERROR
  | typeof FOCUS_VALIDATION_ERROR
  | typeof FOCUS_TIMEOUT
  | typeof FOCUS_UNAVAILABLE
  | typeof LOCAL_PERSISTENCE_ERROR
  | typeof FOCUS_APPLIED_LOCAL_SYNC_FAILED;

export class FocusSetupError extends Error {
  constructor(public readonly code: FocusSetupErrorCode, message: string) {
    super(message);
    this.name = "FocusSetupError";
  }
}

export function mapFocusSetupError(error: unknown): { status: number; body: { code: string; error: string } } {
  if (!(error instanceof FocusSetupError)) {
    return { status: 500, body: { code: "INTERNAL_ERROR", error: "Não foi possível concluir a configuração fiscal." } };
  }
  const statusByCode: Record<FocusSetupErrorCode, number> = {
    [CERTIFICATE_VALIDATION_ERROR]: 400,
    [CSC_VALIDATION_ERROR]: 400,
    [COMPANY_NOT_LINKED]: 409,
    [STORE_CREDENTIAL_NOT_CONFIGURED]: 409,
    [FOCUS_AUTHENTICATION_ERROR]: 502,
    [FOCUS_VALIDATION_ERROR]: 422,
    [FOCUS_UNAVAILABLE]: 503,
    [FOCUS_TIMEOUT]: 504,
    [LOCAL_PERSISTENCE_ERROR]: 500,
    [FOCUS_APPLIED_LOCAL_SYNC_FAILED]: 500,
  };
  return { status: statusByCode[error.code], body: { code: error.code, error: error.message } };
}
