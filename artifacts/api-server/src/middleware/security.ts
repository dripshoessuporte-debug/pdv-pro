import type { Request, Response, NextFunction } from "express";

function isTrue(value: string | undefined): boolean {
  return String(value).toLowerCase() === "true";
}

function getAdminKeys(): string[] {
  return [process.env.ADMIN_RESET_KEY, process.env.ADMIN_API_KEY].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
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

  if (adminKeys.length === 0) {
    res.status(403).json({ error: "Chave administrativa não configurada." });
    return;
  }

  const headerValue = req.headers["x-admin-key"];
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;

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
