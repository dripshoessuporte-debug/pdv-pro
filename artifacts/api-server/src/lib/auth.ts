import crypto from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  platformAdminRoles,
  platformAdminsTable,
  storeMembersTable,
  storesTable,
  usersTable,
} from "@workspace/db";
import type { ActorRole } from "../middleware/rbac";

const SESSION_COOKIE_NAME = "gestor_max_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8;
const SESSION_VERSION = 1;

const roleSet = new Set<string>([
  "max_control",
  "atendente",
  "cozinha",
  "motoboy",
]);
const platformRoleSet = new Set<string>(platformAdminRoles);

export type PlatformRole = (typeof platformAdminRoles)[number];

export type AuthenticatedStore = {
  id: number;
  name: string;
  role: ActorRole;
};

export type AuthenticatedUser = {
  id: number;
  name: string;
  email: string;
};

export type AuthenticatedContext = {
  user: AuthenticatedUser;
  platformRole: PlatformRole | null;
  stores: AuthenticatedStore[];
  currentStore: AuthenticatedStore | null;
};

type SessionPayload = {
  v: typeof SESSION_VERSION;
  userId: number;
  currentStoreId: number | null;
  exp: number;
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET deve ser configurado em produção.");
  }

  return "dev-session-secret-change-me-min-32-bytes";
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function signPayload(payload: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function createSessionToken(payload: SessionPayload): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

function parseSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
    const rawCurrentStoreId = parsed.currentStoreId;
    const hasValidCurrentStoreId =
      rawCurrentStoreId === null ||
      (Number.isInteger(rawCurrentStoreId) && rawCurrentStoreId > 0);
    if (
      parsed?.v !== SESSION_VERSION ||
      !Number.isInteger(parsed.userId) ||
      parsed.userId <= 0 ||
      !hasValidCurrentStoreId ||
      !Number.isInteger(parsed.exp) ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return parsed as SessionPayload;
  } catch {
    return null;
  }
}

function getCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  };
}

export function setSessionCookie(
  res: Response,
  userId: number,
  currentStoreId: number | null,
): void {
  const token = createSessionToken({
    v: SESSION_VERSION,
    userId,
    currentStoreId,
    exp: Date.now() + SESSION_MAX_AGE_MS,
  });
  res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: undefined,
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function hashPassword(password: string): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto
    .scryptSync(password, salt, 64, { N, r, p })
    .toString("base64url");

  return `scrypt$${N}$${r}$${p}$${salt}$${hash}`;
}

export async function verifyPassword(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  if (!passwordHash) return false;

  const [algorithm, nRaw, rRaw, pRaw, salt, expectedHash] =
    passwordHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !nRaw ||
    !rRaw ||
    !pRaw ||
    !salt ||
    !expectedHash
  )
    return false;

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const expected = Buffer.from(expectedHash, "base64url");
  const actual = crypto.scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
  });

  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

export async function findActiveUserByEmail(email: string) {
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      passwordHash: usersTable.passwordHash,
      status: usersTable.status,
    })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${normalizeEmail(email)}`)
    .limit(1);

  return user ?? null;
}

async function getActivePlatformRole(
  userId: number,
): Promise<PlatformRole | null> {
  const [admin] = await db
    .select({ role: platformAdminsTable.role })
    .from(platformAdminsTable)
    .where(
      and(
        eq(platformAdminsTable.userId, userId),
        eq(platformAdminsTable.status, "active"),
      ),
    )
    .limit(1);

  return admin && platformRoleSet.has(admin.role)
    ? (admin.role as PlatformRole)
    : null;
}

async function getActiveStoresForUser(
  userId: number,
): Promise<AuthenticatedStore[]> {
  const memberships = await db
    .select({
      id: storesTable.id,
      name: storesTable.name,
      role: storeMembersTable.role,
      isDefault: storeMembersTable.isDefault,
    })
    .from(storeMembersTable)
    .innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id))
    .where(
      and(
        eq(storeMembersTable.userId, userId),
        eq(storeMembersTable.active, true),
        eq(storesTable.status, "active"),
      ),
    )
    .orderBy(sql`${storeMembersTable.isDefault} DESC`, storesTable.id);

  return memberships
    .filter((member: { role: string }) => roleSet.has(member.role))
    .map((member: { id: number; name: string; role: string }) => ({
      id: member.id,
      name: member.name,
      role: member.role as ActorRole,
    }));
}

export async function buildAuthenticatedContext(
  userId: number,
  currentStoreId?: number | null,
): Promise<AuthenticatedContext | null> {
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.status, "active")))
    .limit(1);

  if (!user) return null;

  const [stores, platformRole] = await Promise.all([
    getActiveStoresForUser(user.id),
    getActivePlatformRole(user.id),
  ]);
  const currentStore =
    stores.find((store: AuthenticatedStore) => store.id === currentStoreId) ??
    stores[0] ??
    null;

  return { user, platformRole, stores, currentStore };
}

export async function resolveAuthenticatedContext(
  req: Request,
): Promise<AuthenticatedContext | null> {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const session = parseSessionToken(token);
  if (!session) return null;

  return buildAuthenticatedContext(session.userId, session.currentStoreId);
}

export async function touchLastLogin(userId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, userId));
}
