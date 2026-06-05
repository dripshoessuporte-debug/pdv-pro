import type { Request, Response, NextFunction } from "express";

function isTrue(value: string | undefined): boolean {
  return String(value).toLowerCase() === "true";
}

const DEV_ADMIN_KEY_FALLBACK = "gestormax-dev";
let warnedAboutDevAdminFallback = false;
let warnedAboutReplitPreviewFallback = false;

function getAdminKeys(): string[] {
  return [process.env.ADMIN_RESET_KEY, process.env.ADMIN_API_KEY]
    .map((value) => value?.trim())
    .filter((v): v is string => Boolean(v));
}

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function getProvidedAdminKey(req: Request): string {
  return getHeaderValue(req.headers["x-admin-key"]);
}

function requestHasReplitPreviewHeader(req: Request): boolean {
  const previewSource = [
    req.headers.host,
    req.headers.origin,
    req.headers.referer,
  ]
    .map((value) => getHeaderValue(value).toLowerCase())
    .join(" ");

  return ["replit.dev", "replit.app", "repl.co"].some((domain) =>
    previewSource.includes(domain),
  );
}

function warnAboutReplitPreviewFallback(): void {
  if (warnedAboutReplitPreviewFallback) return;
  console.warn(
    "Ferramenta dev liberada por fallback de preview Replit. Remover antes de produção.",
  );
  warnedAboutReplitPreviewFallback = true;
}

export function isPreviewDevToolRequest(req: Request): boolean {
  if (getProvidedAdminKey(req) !== DEV_ADMIN_KEY_FALLBACK) return false;

  if (process.env.NODE_ENV !== "production") return true;
  if (isTrue(process.env.ALLOW_DEV_ADMIN_FALLBACK)) return true;

  if (requestHasReplitPreviewHeader(req)) {
    warnAboutReplitPreviewFallback();
    return true;
  }

  return false;
}

function warnAboutDevAdminFallback(): void {
  if (warnedAboutDevAdminFallback) return;
  console.warn(
    "Usando chave administrativa padrão de desenvolvimento. Não use em produção.",
  );
  warnedAboutDevAdminFallback = true;
}

export function requireDevRoutesEnabled(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isTrue(process.env.ENABLE_DEV_ROUTES) && !isPreviewDevToolRequest(req)) {
    res.status(403).json({
      error: "Rotas de desenvolvimento desativadas neste ambiente.",
    });
    return;
  }
  next();
}

export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const adminKeys = getAdminKeys();

  const provided = getProvidedAdminKey(req);

  if (adminKeys.length === 0) {
    if (isPreviewDevToolRequest(req)) {
      warnAboutDevAdminFallback();
      next();
      return;
    }

    if (provided) {
      res.status(403).json({ error: "Chave administrativa inválida." });
      return;
    }

    res.status(403).json({ error: "Chave administrativa não configurada." });
    return;
  }

  if (!provided || !adminKeys.includes(provided)) {
    res.status(403).json({ error: "Chave administrativa inválida." });
    return;
  }

  next();
}

export function requireIntegrationKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requiredKey = process.env.INTEGRATION_API_KEY;

  if (!requiredKey || !requiredKey.trim()) {
    res.status(503).json({ error: "Integração não configurada." });
    return;
  }

  const headerValue = req.headers["x-integration-key"];
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!provided || provided !== requiredKey) {
    res.status(401).json({ error: "Chave de integração inválida." });
    return;
  }

  next();
}
