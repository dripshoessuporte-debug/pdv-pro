import type { FocusNfeSafeErrorDetails } from "./types";

export type FocusNfeErrorKind =
  | "authentication"
  | "validation"
  | "communication"
  | "timeout"
  | "temporary_unavailable"
  | "unexpected_response";

const SENSITIVE_KEYS = /authorization|token|senha|password|certificado|certificate|csc|secret|conteudo|content/i;

export function redactFocusNfeSecrets(value: unknown, secrets: string[] = []): unknown {
  const activeSecrets = secrets.filter((secret) => secret.length >= 6);
  if (typeof value === "string") {
    return activeSecrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value);
  }
  if (Array.isArray(value)) return value.map((entry) => redactFocusNfeSecrets(entry, activeSecrets));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      redactFocusNfeSecrets(entry, activeSecrets),
    ]),
  );
}

export function sanitizeFocusNfeDetails(value: unknown, secrets: string[] = []): unknown {
  if (Array.isArray(value)) return value.map((entry) => sanitizeFocusNfeDetails(entry, secrets));
  if (!value || typeof value !== "object") return redactFocusNfeSecrets(value, secrets);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_KEYS.test(key) ? "[REDACTED]" : sanitizeFocusNfeDetails(entry, secrets),
    ]),
  );
}

export class FocusNfeError extends Error {
  readonly kind: FocusNfeErrorKind;
  readonly status?: number;
  readonly providerCode?: string;
  readonly safeDetails?: FocusNfeSafeErrorDetails;

  constructor(args: {
    kind: FocusNfeErrorKind;
    message: string;
    status?: number;
    providerCode?: string;
    safeDetails?: FocusNfeSafeErrorDetails;
    cause?: unknown;
  }) {
    super(args.message, { cause: args.cause });
    this.name = "FocusNfeError";
    this.kind = args.kind;
    this.status = args.status;
    this.providerCode = args.providerCode;
    this.safeDetails = args.safeDetails;
  }
}

export function classifyFocusNfeStatus(status: number): FocusNfeErrorKind {
  if (status === 401 || status === 403) return "authentication";
  if (status === 400 || status === 422) return "validation";
  if (status === 408 || status === 429 || status >= 500) return "temporary_unavailable";
  return "unexpected_response";
}
