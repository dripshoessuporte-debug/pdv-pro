import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, userEntitlementsTable, usersTable } from "@workspace/db";
import {
  buildAuthenticatedContext,
  clearSessionCookie,
  findActiveUserByEmail,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  resolveAuthenticatedContext,
  setSessionCookie,
  touchLastLogin,
  verifyPassword,
} from "../lib/auth";

const router: IRouter = Router();

const invalidCredentialsMessage = "E-mail ou senha inválidos.";
const duplicatedEmailMessage = "Este e-mail já está cadastrado.";

function isDuplicateEmailError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    detail?: unknown;
    message?: unknown;
  };
  if (candidate.code !== "23505") return false;
  const constraint =
    typeof candidate.constraint === "string" ? candidate.constraint : "";
  const detail = typeof candidate.detail === "string" ? candidate.detail : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  return [constraint, detail, message].some((value) =>
    value.toLowerCase().includes("email"),
  );
}

function logRegisterError(error: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.error("[auth/register] Falha ao criar conta", error);
  }
}

const safePendingEntitlement = {
  plan: null,
  status: "pending",
  trialEndsAt: null,
  provider: null,
  currentPeriodEnd: null,
};

async function getSerializedEntitlement(userId: number) {
  try {
    const [entitlement] = await db
      .select({
        plan: userEntitlementsTable.plan,
        status: userEntitlementsTable.status,
        trialEndsAt: userEntitlementsTable.trialEndsAt,
        provider: userEntitlementsTable.provider,
        currentPeriodEnd: userEntitlementsTable.currentPeriodEnd,
      })
      .from(userEntitlementsTable)
      .where(sql`${userEntitlementsTable.userId} = ${userId}`)
      .limit(1);

    return {
      plan: entitlement?.plan ?? null,
      status: entitlement?.status ?? "pending",
      trialEndsAt: entitlement?.trialEndsAt ?? null,
      provider: entitlement?.provider ?? null,
      currentPeriodEnd: entitlement?.currentPeriodEnd ?? null,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth/entitlement] Falha ao serializar entitlement; usando fallback seguro.", error);
    }

    return safePendingEntitlement;
  }
}

async function serializeContext(
  context: NonNullable<Awaited<ReturnType<typeof buildAuthenticatedContext>>>,
) {
  return {
    user: context.user,
    platformRole: context.platformRole,
    stores: context.stores,
    currentStore: context.currentStore,
    entitlement: context.platformRole
      ? null
      : await getSerializedEntitlement(context.user.id),
  };
}

const minimumPasswordLength = 6;

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

router.post("/auth/register", async (req, res) => {
  if (process.env.DEV_ALLOW_PUBLIC_REGISTER !== "true") {
    res.status(403).json({ error: "Cadastro direto desativado. Assine um plano ou solicite acesso." });
    return;
  }
  const name = asTrimmedString(req.body?.name);
  const email = normalizeEmail(asTrimmedString(req.body?.email));
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!name) {
    res.status(400).json({ error: "Informe seu nome completo." });
    return;
  }

  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: "Informe um e-mail válido." });
    return;
  }

  if (password.length < minimumPasswordLength) {
    res.status(400).json({
      error: `A senha deve ter pelo menos ${minimumPasswordLength} caracteres.`,
    });
    return;
  }

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);
  if (existingUser) {
    res.status(409).json({ error: duplicatedEmailMessage });
    return;
  }

  let createdUser: { id: number };
  try {
    [createdUser] = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(usersTable)
        .values({
          name,
          email,
          passwordHash: hashPassword(password),
          status: "active",
        })
        .returning({ id: usersTable.id });

      await tx.insert(userEntitlementsTable).values({
        userId: user.id,
        plan: null,
        status: "pending",
        source: "system",
      });

      return [user];
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      res.status(409).json({ error: duplicatedEmailMessage });
      return;
    }

    logRegisterError(error);
    res.status(500).json({ error: "Não foi possível criar a conta agora." });
    return;
  }

  const context = await buildAuthenticatedContext(createdUser.id, null);
  if (!context) {
    res
      .status(500)
      .json({ error: "Conta criada, mas não foi possível iniciar sessão." });
    return;
  }

  await touchLastLogin(createdUser.id);
  setSessionCookie(res, context.user.id, null);
  res.status(201).json(await serializeContext(context));
});

router.post("/auth/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!email.trim() || !password) {
    res.status(401).json({ error: invalidCredentialsMessage });
    return;
  }

  const user = await findActiveUserByEmail(email);
  if (!user || user.status !== "active") {
    res.status(401).json({ error: invalidCredentialsMessage });
    return;
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    res.status(401).json({ error: invalidCredentialsMessage });
    return;
  }

  const context = await buildAuthenticatedContext(user.id);
  if (!context) {
    res
      .status(403)
      .json({ error: "Usuário sem loja ativa ou acesso administrativo." });
    return;
  }

  await touchLastLogin(user.id);
  setSessionCookie(res, context.user.id, context.currentStore?.id ?? null);
  res.json(await serializeContext(context));
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

router.get("/auth/me", async (req, res) => {
  const context = await resolveAuthenticatedContext(req);
  if (!context) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  res.json(await serializeContext(context));
});

export default router;
