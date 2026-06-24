export type FocusNfeEnvironment = "homologation" | "production";

export type FocusNfeCredentials = {
  /** Token secreto gerado pela Focus após o cadastro da empresa emitente. */
  token: string;
  /** Referência segura da origem do segredo (env, vault, etc.), nunca o segredo em si. */
  tokenReference?: string;
};

export type FocusNfeStoreContext = {
  storeId: number;
  environment: FocusNfeEnvironment;
  credentials: FocusNfeCredentials;
  providerCompanyId?: string | null;
};

export type FocusNfeRequestOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  idempotencyReference?: string;
};

export type FocusNfeSafeErrorDetails = {
  codigo?: string;
  mensagem?: string;
  erros?: unknown;
  raw?: unknown;
};

export type FocusNfeResult<T = unknown> = {
  status: number;
  headers: Record<string, string>;
  data: T;
};

export type FocusNfeLogger = {
  info?: (payload: Record<string, unknown>, message?: string) => void;
  warn?: (payload: Record<string, unknown>, message?: string) => void;
  error?: (payload: Record<string, unknown>, message?: string) => void;
};
