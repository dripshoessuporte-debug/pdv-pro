import type { Request, Response, NextFunction } from "express";

function isTrue(value: string | undefined): boolean {
  return String(value).toLowerCase() === "true";
}

const DEV_ADMIN_KEY_FALLBACK = "gestormax-dev";
let warnedAboutDevAdminFallback = false;

function getAdminKeys(): string[] {
  return [process.env.ADMIN_RESET_KEY, process.env.ADMIN_API_KEY]
    .map((value) => value?.trim())
    .filter((v): v is string => Boolean(v));
}

function isDevAdminFallbackAllowed(): boolean {
  return (
    isTrue(process.env.ENABLE_DEV_ROUTES) &&
    (process.env.NODE_ENV !== "production" ||
      isTrue(process.env.ALLOW_DEV_ADMIN_FALLBACK))
  );
}

function warnAboutDevAdminFallback(): void {
  if (warnedAboutDevAdminFallback) return;
  console.warn(
    "Usando chave administrativa padrão de desenvolvimento. Não use em produção.",
  );
  warnedAboutDevAdminFallback = true;
}

export function requireDevRoutesEnabled(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isTrue(process.env.ENABLE_DEV_ROUTES)) {
    res.status(403).json({
      error:
        "Rotas de desenvolvimento desativadas. Ative ENABLE_DEV_ROUTES=true no ambiente de teste.",
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

  const headerValue = req.headers["x-admin-key"];
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (adminKeys.length === 0) {
    if (isDevAdminFallbackAllowed() && provided === DEV_ADMIN_KEY_FALLBACK) {
      warnAboutDevAdminFallback();
      next();
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
