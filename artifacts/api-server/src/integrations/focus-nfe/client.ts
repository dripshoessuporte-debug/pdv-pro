import { classifyFocusNfeStatus, FocusNfeError, sanitizeFocusNfeDetails } from "./errors";
import { getFocusNfeConfig, type FocusNfeConfig } from "./config";
import type { FocusNfeLogger, FocusNfeRequestOptions, FocusNfeResult, FocusNfeStoreContext } from "./types";

type FetchLike = typeof fetch;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function buildBasicAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`${token}:`, "utf8").toString("base64")}`;
}

function safeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    if (/authorization|token|cookie|secret|password/i.test(key)) continue;
    result[key] = value;
  }
  return result;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function buildUrl(baseUrl: string, request: FocusNfeRequestOptions): URL {
  const url = new URL(request.path.startsWith("/") ? request.path : `/${request.path}`, baseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }
  if (request.idempotencyReference) url.searchParams.set("ref", request.idempotencyReference);
  return url;
}

export class FocusNfeClient {
  private readonly config: FocusNfeConfig;
  private readonly fetchImpl: FetchLike;
  private readonly logger?: FocusNfeLogger;

  constructor(options: { config?: FocusNfeConfig; fetchImpl?: FetchLike; logger?: FocusNfeLogger } = {}) {
    this.config = options.config ?? getFocusNfeConfig();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger;
  }

  async request<T = unknown>(context: FocusNfeStoreContext, request: FocusNfeRequestOptions): Promise<FocusNfeResult<T>> {
    if (!Number.isSafeInteger(context.storeId) || context.storeId <= 0) {
      throw new FocusNfeError({ kind: "validation", message: "Contexto fiscal sem loja válida." });
    }
    if (!context.credentials.token) {
      throw new FocusNfeError({ kind: "authentication", message: "Token Focus NFe não configurado para o ambiente fiscal." });
    }
    if (request.idempotencyReference && !MUTATING_METHODS.has(request.method)) {
      throw new FocusNfeError({ kind: "validation", message: "Referência idempotente deve ser usada apenas em operações mutáveis." });
    }

    const url = buildUrl(this.config.baseUrls[context.environment], request);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: request.method,
        headers: {
          Authorization: buildBasicAuthHeader(context.credentials.token),
          Accept: "application/json",
          ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: controller.signal,
      });
      const body = await parseResponseBody(response);
      const elapsedMs = Date.now() - startedAt;

      if (!response.ok) {
        const details = sanitizeFocusNfeDetails(body, [context.credentials.token]) as Record<string, unknown> | null;
        const providerCode = typeof details?.codigo === "string" ? details.codigo : undefined;
        this.logger?.warn?.({ operation: request.method, environment: context.environment, storeId: context.storeId, status: response.status, providerCode, elapsedMs }, "Focus NFe request failed");
        throw new FocusNfeError({
          kind: classifyFocusNfeStatus(response.status),
          message: "Focus NFe retornou erro para a operação fiscal.",
          status: response.status,
          providerCode,
          safeDetails: details ? { codigo: providerCode, mensagem: typeof details.mensagem === "string" ? details.mensagem : undefined, erros: details.erros, raw: details.raw } : undefined,
        });
      }

      this.logger?.info?.({ operation: request.method, environment: context.environment, storeId: context.storeId, status: response.status, elapsedMs }, "Focus NFe request completed");
      return { status: response.status, headers: safeHeaders(response.headers), data: body as T };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      if (error instanceof FocusNfeError) throw error;
      const kind = error instanceof DOMException && error.name === "AbortError" ? "timeout" : "communication";
      this.logger?.error?.({ operation: request.method, environment: context.environment, storeId: context.storeId, errorCode: kind, elapsedMs }, "Focus NFe communication failed");
      throw new FocusNfeError({ kind, message: kind === "timeout" ? "Tempo esgotado ao comunicar com a Focus NFe." : "Falha de comunicação com a Focus NFe.", cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const focusNfeAuthForTests = { buildBasicAuthHeader };
