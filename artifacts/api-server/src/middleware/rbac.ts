import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  cashRegistersTable,
  db,
  storeMembersTable,
  usersTable,
} from "@workspace/db";
import { getDefaultStoreIdOrThrow } from "../lib/store-context";

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
  return (
    process.env.ALLOW_DEV_RBAC_HEADERS === "true" ||
    process.env.NODE_ENV !== "production"
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

  const devHeadersAllowed = allowDevRbacHeaders();
  const requestedStoreId = devHeadersAllowed
    ? parsePositiveInt(req.header("x-store-id"))
    : null;
  const storeId = requestedStoreId ?? (await getDefaultStoreIdOrThrow());
  const userId = devHeadersAllowed
    ? parsePositiveInt(req.header("x-user-id"))
    : null;

  if (userId) {
    const [member] = await db
      .select({
        userId: usersTable.id,
        name: usersTable.name,
        role: storeMembersTable.role,
        storeId: storeMembersTable.storeId,
      })
      .from(storeMembersTable)
      .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
      .where(
        and(
          eq(storeMembersTable.userId, userId),
          eq(storeMembersTable.storeId, storeId),
          eq(usersTable.status, "active"),
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
      role: memberRole,
      isDevelopmentFallback: false,
    };
    return req.actor;
  }

  if (!devHeadersAllowed) {
    throw authenticationRequiredError();
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
    await resolveCurrentActor(req);
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

export const rbacRouteGuard: RequestHandler = async (req, res, next) => {
  const actor = await resolveCurrentActor(req);
  const path = req.path;

  const allowedByRole: Record<ActorRole, RegExp[]> = {
    max_control: [/.*/],
    atendente: [
      /^\/orders(?:\/|$)/,
      /^\/tables(?:\/|$)/,
      /^\/kitchen(?:\/|$)/,
      /^\/delivery(?:\/|$)/,
      /^\/couriers(?:\/|$)/,
      /^\/alerts(?:\/|$)/,
      /^\/cash\/current$/,
    ],
    cozinha: [/^\/kitchen(?:\/|$)/, /^\/health(?:\/|$)/],
    motoboy: [
      /^\/delivery(?:\/|$)/,
      /^\/couriers(?:\/|$)/,
      /^\/health(?:\/|$)/,
    ],
  };

  if (!allowedByRole[actor.role].some((pattern) => pattern.test(path))) {
    res
      .status(403)
      .json({ error: "Você não tem permissão para acessar esta área." });
    return;
  }

  next();
};
