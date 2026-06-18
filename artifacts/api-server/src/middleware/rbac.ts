import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  cashRegistersTable,
  db,
  storeMembersTable,
  storesTable,
  usersTable,
} from "@workspace/db";
import { getDefaultStoreIdOrThrow } from "../lib/store-context";
import { resolveAuthenticatedContext } from "../lib/auth";
import { logPlatformAuditAction } from "../lib/platform-audit";

export const roles = [
  "max_control",
  "atendente",
  "cozinha",
  "motoboy",
] as const;
export type ActorRole = (typeof roles)[number];

export type CurrentActor = {
  id: number | null;
  storeId: number;
  name: string;
  email?: string;
  role: ActorRole;
  isDevelopmentFallback: boolean;
};

declare global {
  namespace Express {
    interface Request {
      actor?: CurrentActor;
    }
  }
}

const roleSet = new Set<string>(roles);

function allowDevRbacHeaders(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ALLOW_DEV_RBAC_HEADERS === "false") return false;

  return (
    process.env.ALLOW_DEV_RBAC_HEADERS === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function hasDevRbacHeaders(req: Request): boolean {
  return Boolean(
    req.header("x-store-id") ||
    req.header("x-user-id") ||
    req.header("x-rbac-role") ||
    req.header("x-rbac-user-id") ||
    req.header("x-rbac-name"),
  );
}

function authenticationRequiredError(): Error & { status?: number } {
  const error = new Error(
    "Autenticação real necessária em produção para resolver loja, usuário e função.",
  ) as Error & { status?: number };
  error.status = 401;
  return error;
}

function parsePositiveInt(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseRole(value: unknown): ActorRole | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const role = String(raw ?? "");
  return roleSet.has(role) ? (role as ActorRole) : null;
}

export async function resolveCurrentActor(req: Request): Promise<CurrentActor> {
  if (req.actor) return req.actor;

  const authenticatedContext = await resolveAuthenticatedContext(req);
  if (authenticatedContext?.currentStore) {
    req.actor = {
      id: authenticatedContext.user.id,
      storeId: authenticatedContext.currentStore.id,
      name: authenticatedContext.user.name,
      email: authenticatedContext.user.email,
      role: authenticatedContext.currentStore.role,
      isDevelopmentFallback: false,
    };
    return req.actor;
  }

  if (authenticatedContext) {
    const error = new Error("Usuário sem loja ativa para acessar o PDV.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }

  const devHeadersAllowed = allowDevRbacHeaders();
  if (!devHeadersAllowed) {
    if (hasDevRbacHeaders(req)) {
      const error = new Error(
        "Headers de desenvolvimento não são aceitos neste ambiente.",
      );
      (error as Error & { status?: number }).status = 403;
      throw error;
    }
    throw authenticationRequiredError();
  }

  const requestedStoreId = parsePositiveInt(req.header("x-store-id"));
  const storeId = requestedStoreId ?? (await getDefaultStoreIdOrThrow());
  const userId = parsePositiveInt(req.header("x-user-id"));

  if (userId) {
    const [member] = await db
      .select({
        userId: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: storeMembersTable.role,
        storeId: storeMembersTable.storeId,
      })
      .from(storeMembersTable)
      .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
      .innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id))
      .where(
        and(
          eq(storeMembersTable.userId, userId),
          eq(storeMembersTable.storeId, storeId),
          eq(storeMembersTable.active, true),
          eq(usersTable.status, "active"),
          eq(storesTable.status, "active"),
        ),
      )
      .limit(1);

    if (!member) {
      const error = new Error(
        "Usuário não pertence à loja informada ou está inativo.",
      );
      (error as Error & { status?: number }).status = 403;
      throw error;
    }

    const memberRole = roleSet.has(member.role)
      ? (member.role as ActorRole)
      : "max_control";
    req.actor = {
      id: member.userId,
      storeId: member.storeId,
      name: member.name,
      email: member.email,
      role: memberRole,
      isDevelopmentFallback: false,
    };
    return req.actor;
  }

  const fallbackRole =
    parseRole(req.header("x-rbac-role")) ??
    parseRole(process.env.RBAC_DEV_ROLE) ??
    "max_control";
  req.actor = {
    id: parsePositiveInt(req.header("x-rbac-user-id")),
    storeId,
    name: String(
      req.header("x-rbac-name") ??
        process.env.RBAC_DEV_NAME ??
        "Operador desenvolvimento",
    ),
    role: fallbackRole,
    isDevelopmentFallback: true,
  };
  return req.actor;
}

export const attachCurrentActor: RequestHandler = async (req, res, next) => {
  try {
    const context = await resolveAuthenticatedContext(req);
    await resolveCurrentActor(req);
    if (
      context?.supportMode &&
      context.supportModeType === "read_only" &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      await logPlatformAuditAction(
        context.user,
        "support_readonly_blocked_write",
        "store",
        String(context.currentStore?.id ?? ""),
        {
          path: req.originalUrl,
          method: req.method,
          supportSessionId: context.supportSessionId,
        },
      );
      res
        .status(403)
        .json({
          error:
            "Modo suporte somente leitura. Encerre e inicie suporte com permissão de edição para alterar dados.",
        });
      return;
    }
    next();
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({
      error:
        error instanceof Error
          ? error.message
          : "Falha ao resolver usuário atual.",
    });
  }
};

export function requireRole(...allowedRoles: ActorRole[]): RequestHandler {
  return async (req, res, next) => {
    const actor = await resolveCurrentActor(req);
    if (!allowedRoles.includes(actor.role)) {
      res
        .status(403)
        .json({ error: "Você não tem permissão para acessar esta área." });
      return;
    }
    next();
  };
}

export async function getCurrentActor(req: Request): Promise<CurrentActor> {
  return resolveCurrentActor(req);
}

export async function getCurrentOperationalScope(req: Request): Promise<{
  actor: CurrentActor;
  cashRegisterId: number | null;
  openedAt: Date | null;
}> {
  const actor = await resolveCurrentActor(req);
  if (actor.role !== "atendente")
    return { actor, cashRegisterId: null, openedAt: null };

  const filters = [
    eq(cashRegistersTable.storeId, actor.storeId),
    eq(cashRegistersTable.status, "open"),
  ];
  if (actor.id) filters.push(eq(cashRegistersTable.operatorUserId, actor.id));
  else filters.push(sql`${cashRegistersTable.operator} = ${actor.name}`);

  const [register] = await db
    .select({
      id: cashRegistersTable.id,
      openedAt: cashRegistersTable.openedAt,
    })
    .from(cashRegistersTable)
    .where(and(...filters))
    .orderBy(sql`${cashRegistersTable.openedAt} DESC`)
    .limit(1);

  return {
    actor,
    cashRegisterId: register?.id ?? null,
    openedAt: register?.openedAt ?? null,
  };
}

export async function requireOpenShift(
  req: Request,
  res: Response,
): Promise<{
  actor: CurrentActor;
  cashRegisterId: number | null;
  openedAt: Date | null;
} | null> {
  const scope = await getCurrentOperationalScope(req);
  if (scope.actor.role === "atendente" && !scope.cashRegisterId) {
    res.status(403).json({ error: "Abra o caixa para iniciar seu plantão." });
    return null;
  }
  return scope;
}

export function requireStoreAccess(): RequestHandler {
  return async (req, res, next) => {
    await resolveCurrentActor(req);
    next();
  };
}

function canAtendenteAccess(method: string, path: string): boolean {
  if (/^\/orders(?:\/|$)/.test(path)) return true;
  if (/^\/tables(?:\/|$)/.test(path)) return true;
  if (/^\/kitchen(?:\/|$)/.test(path)) return true;
  if (/^\/delivery(?:\/|$)/.test(path)) return true;
  if (/^\/couriers(?:\/|$)/.test(path)) return true;
  if (/^\/alerts(?:\/|$)/.test(path)) return true;
  if (/^\/payments(?:\/|$)/.test(path)) return true;
  if (path === "/cash/current") return true;

  if (method !== "GET") return false;
  if (path === "/menu/categories") return true;
  if (path === "/menu/products") return true;
  if (/^\/menu\/products\/\d+$/.test(path)) return true;
  if (/^\/menu\/products\/\d+\/variants$/.test(path)) return true;
  if (path === "/menu/addon-groups") return true;
  if (/^\/menu\/addon-groups\/\d+\/options$/.test(path)) return true;
  if (/^\/menu\/products\/\d+\/addon-groups$/.test(path)) return true;

  return false;
}

export const rbacRouteGuard: RequestHandler = async (req, res, next) => {
  const actor = await resolveCurrentActor(req);
  const path = req.path;
  const method = req.method.toUpperCase();

  const orderDetailReadPattern = /^\/orders\/\d+$/;
  const canReadOrderDetail =
    method === "GET" && orderDetailReadPattern.test(path);

  if (path === "/settings") {
    if (method === "GET") {
      next();
      return;
    }
    if (actor.role !== "max_control") {
      res
        .status(403)
        .json({ error: "Somente Max Control pode alterar configurações." });
      return;
    }
  }

  const allowedByRole: Record<ActorRole, RegExp[]> = {
    max_control: [/.*/],
    atendente: [],
    cozinha: [/^\/kitchen(?:\/|$)/],
    motoboy: [/^\/delivery(?:\/|$)/, /^\/couriers(?:\/|$)/],
  };

  const allowed =
    actor.role === "atendente"
      ? canAtendenteAccess(method, path)
      : canReadOrderDetail ||
        allowedByRole[actor.role].some((pattern) => pattern.test(path));

  if (!allowed) {
    res
      .status(403)
      .json({ error: "Você não tem permissão para acessar esta área." });
    return;
  }

  next();
};
