import type { RequestHandler } from "express";
import { resolveAuthenticatedContext, type PlatformRole } from "../lib/auth";

export const platformRoles = [
  "platform_owner",
  "platform_admin",
  "platform_support",
  "platform_finance",
] as const satisfies readonly PlatformRole[];

declare global {
  namespace Express {
    interface Request {
      platformRole?: PlatformRole;
    }
  }
}

export function requirePlatformRole(
  ...allowedRoles: PlatformRole[]
): RequestHandler {
  return async (req, res, next) => {
    try {
      const context = await resolveAuthenticatedContext(req);
      const role = context?.platformRole ?? null;

      if (!role || !allowedRoles.includes(role)) {
        res
          .status(403)
          .json({ error: "Acesso administrativo da plataforma necessário." });
        return;
      }

      req.platformRole = role;
      next();
    } catch {
      res.status(401).json({ error: "Autenticação necessária." });
    }
  };
}
