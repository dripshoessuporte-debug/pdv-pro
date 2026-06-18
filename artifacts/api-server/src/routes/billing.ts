import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  accessRequestsTable,
  billingProviderProductsTable,
  db,
  entitlementPlans,
  storeMembersTable,
  storesTable,
  userActivationTokensTable,
  userEntitlementsTable,
  usersTable,
} from "@workspace/db";
import {
  isValidEmail,
  normalizeEmail,
  resolveAuthenticatedContext,
} from "../lib/auth";
import {
  ensureAccessRequestsTable,
  isRuntimeSchemaRepairEnabled,
} from "../lib/ensure-billing-schema";

const router: IRouter = Router();
const planSet = new Set<string>(entitlementPlans);
const planDefs = [
  {
    plan: "basico",
    name: "Gestor Max Start",
    description: "PDV e operação básica para começar com controle.",
    features: ["PDV", "Caixa", "Pedidos", "Cardápio"],
  },
  {
    plan: "medio",
    name: "Gestor Max Delivery",
    description: "Operação completa com delivery, rotas e motoboys.",
    features: ["PDV", "Delivery", "Rotas", "Motoboys"],
  },
  {
    plan: "pro",
    name: "Gestor Max Pro",
    description:
      "Completo, com fiscal preparado para ativação futura via Focus.",
    features: ["PDV", "Delivery", "Rotas", "Motoboys", "Fiscal em breve"],
  },
];
const checkoutEnv: Record<string, string | undefined> = {
  basico: process.env.CAKTO_CHECKOUT_START_URL,
  medio: process.env.CAKTO_CHECKOUT_DELIVERY_URL,
  pro: process.env.CAKTO_CHECKOUT_PRO_URL,
};
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const normalizeAccessPlan = (value: unknown) => {
  const plan = clean(value).toLowerCase();
  const normalized = plan.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["basico", "start", "gestor max start"].includes(normalized))
    return "basico";
  if (["medio", "delivery", "gestor max delivery"].includes(normalized))
    return "medio";
  if (["pro", "gestor max pro"].includes(normalized)) return "pro";
  return plan;
};
const sha = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
function buildActivationUrl(token: string) {
  const baseUrl = clean(process.env.APP_PUBLIC_URL).replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/activate/${token}` : `/activate/${token}`;
}
async function createActivationToken(
  userId: number,
  tx: Pick<typeof db, "insert"> = db,
) {
  const token = crypto.randomBytes(32).toString("base64url");
  await tx.insert(userActivationTokensTable).values({
    userId,
    tokenHash: sha(token),
    expiresAt: new Date(Date.now() + 14 * 86400000),
  });
  return buildActivationUrl(token);
}

type PublicPlan = (typeof planDefs)[number] & {
  checkoutUrl: string | null;
  enabled: boolean;
};

type PublicPlansResult = {
  plans: PublicPlan[];
  query: { ok: boolean; productCount: number; error: string | null };
};

function logDev(message: string, error: unknown) {
  if (process.env.NODE_ENV === "development") console.error(message, error);
}

async function buildPublicPlans(): Promise<PublicPlansResult> {
  let rows: { plan: string; checkoutUrl: string | null }[] = [];
  const query = { ok: true, productCount: 0, error: null as string | null };

  try {
    rows = await db
      .select({
        plan: billingProviderProductsTable.plan,
        checkoutUrl: billingProviderProductsTable.checkoutUrl,
      })
      .from(billingProviderProductsTable)
      .where(
        sql`${billingProviderProductsTable.provider} = 'cakto' and ${billingProviderProductsTable.active} = true and ${billingProviderProductsTable.checkoutUrl} is not null`,
      );
    query.productCount = rows.length;
  } catch (error) {
    query.ok = false;
    query.error =
      error instanceof Error
        ? error.message
        : "Erro desconhecido ao consultar produtos Cakto.";
    logDev(
      "[billing/public-plans] Falha ao consultar billing_provider_products; usando fallback seguro.",
      error,
    );
  }

  return {
    plans: planDefs.map((p) => {
      const row = rows.find((r) => r.plan === p.plan);
      const checkoutUrl = row?.checkoutUrl ?? checkoutEnv[p.plan] ?? null;
      return { ...p, checkoutUrl, enabled: Boolean(checkoutUrl) };
    }),
    query,
  };
}

router.get("/billing/public-plans", async (_req, res) => {
  const { plans } = await buildPublicPlans();
  res.json({ plans });
});

router.get("/billing/debug", async (_req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const result = await buildPublicPlans();
  res.json({
    env: {
      CAKTO_CHECKOUT_START_URL: Boolean(process.env.CAKTO_CHECKOUT_START_URL),
      CAKTO_CHECKOUT_DELIVERY_URL: Boolean(
        process.env.CAKTO_CHECKOUT_DELIVERY_URL,
      ),
      CAKTO_CHECKOUT_PRO_URL: Boolean(process.env.CAKTO_CHECKOUT_PRO_URL),
      CAKTO_WEBHOOK_SECRET: Boolean(process.env.CAKTO_WEBHOOK_SECRET),
    },
    billingProviderProducts: result.query,
    plans: result.plans,
  });
});

router.post("/access-requests", async (req, res): Promise<void> => {
  const name = clean(req.body?.name),
    email = normalizeEmail(clean(req.body?.email)),
    phone = clean(req.body?.phone),
    restaurantName = clean(
      req.body?.restaurantName || req.body?.restaurant_name,
    ),
    requestedPlan = normalizeAccessPlan(
      req.body?.requestedPlan || req.body?.requested_plan || req.body?.plan,
    ),
    message = clean(req.body?.message) || null;
  const normalizedPayload = {
    name,
    email,
    phone,
    restaurantName,
    requestedPlan,
    message,
  };

  if (process.env.NODE_ENV === "development") {
    console.info("[access-requests] Payload recebido.", req.body);
    console.info("[access-requests] Payload normalizado.", normalizedPayload);
  }

  if (
    !name ||
    !isValidEmail(email) ||
    !phone ||
    !restaurantName ||
    !planSet.has(requestedPlan)
  ) {
    res.status(400).json({
      error: "Preencha nome, e-mail, telefone, restaurante e plano desejado.",
    });
    return;
  }

  try {
    await ensureAccessRequestsTable();
    const [request] = await db
      .insert(accessRequestsTable)
      .values({
        name,
        email,
        phone,
        restaurantName,
        requestedPlan,
        message,
        status: "pending",
      })
      .returning({
        id: accessRequestsTable.id,
        status: accessRequestsTable.status,
      });
    res
      .status(201)
      .json({ ok: true, request: { id: request.id, status: request.status } });
  } catch (error) {
    const debugId = crypto.randomUUID();
    if (process.env.NODE_ENV === "development")
      console.error(
        "[access-requests] Falha ao salvar solicitação de acesso.",
        { debugId, error },
      );
    else
      logDev("[access-requests] Falha ao salvar solicitação de acesso.", error);
    res
      .status(500)
      .json({ error: "Não foi possível salvar a solicitação agora.", debugId });
  }
});

router.get("/access-requests/debug", async (_req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    await ensureAccessRequestsTable();
    const columnsResult = await db.execute(sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'access_requests'
      order by ordinal_position
    `);
    const countResult = await db.execute(
      sql`select count(*)::int as count from access_requests`,
    );
    const columns = columnsResult.rows.map((row: { column_name: unknown }) =>
      String(row.column_name),
    );
    const count = Number(countResult.rows[0]?.count ?? 0);
    res.json({
      ok: true,
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      runtimeSchemaRepairEnabled: isRuntimeSchemaRepairEnabled(),
      table: { exists: columns.length > 0, columns, count },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    });
  }
});

router.post("/billing/request-access", async (req, res): Promise<void> => {
  const context = await resolveAuthenticatedContext(req);
  if (!context) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }
  if (context.platformRole) {
    res.status(403).json({ error: "Admin Max não usa solicitação de plano." });
    return;
  }
  const plan = clean(req.body?.plan);
  if (!planSet.has(plan)) {
    res.status(400).json({ error: "Plano inválido." });
    return;
  }
  const [membership] = await db
    .select({ id: storeMembersTable.id })
    .from(storeMembersTable)
    .innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id))
    .where(eq(storeMembersTable.userId, context.user.id))
    .limit(1);
  if (membership) {
    res.status(409).json({ error: "Usuário já possui loja vinculada." });
    return;
  }
  await db
    .insert(userEntitlementsTable)
    .values({
      userId: context.user.id,
      plan,
      status: "pending",
      source: "system",
    })
    .onConflictDoUpdate({
      target: userEntitlementsTable.userId,
      set: { plan, status: "pending", source: "system", updatedAt: new Date() },
    });
  res.json({
    ok: true,
    entitlement: { plan, status: "pending", trialEndsAt: null },
  });
});

async function tableExists(tableName: string) {
  const result = await db.execute(sql`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = ${tableName}
    ) as exists
  `);
  return Boolean(result.rows[0]?.exists);
}

function actionError(
  res: any,
  statusCode: number,
  error: string,
  details?: unknown,
) {
  res.status(statusCode).json({
    ok: false,
    error,
    ...(process.env.NODE_ENV === "development" && details
      ? {
          details: details instanceof Error ? details.message : String(details),
        }
      : {}),
  });
}

async function getAccessRequestDebugData(id: number) {
  await ensureAccessRequestsTable();
  const [request] = await db
    .select()
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.id, id))
    .limit(1);
  const normalizedEmail = request ? normalizeEmail(request.email) : "";
  const [userByEmail] = normalizedEmail
    ? await db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          status: usersTable.status,
          createdAt: usersTable.createdAt,
          updatedAt: usersTable.updatedAt,
        })
        .from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${normalizedEmail}`)
        .limit(1)
    : [];
  const [entitlement] = userByEmail
    ? await db
        .select()
        .from(userEntitlementsTable)
        .where(eq(userEntitlementsTable.userId, userByEmail.id))
        .limit(1)
    : [];
  const [tokensCount] = userByEmail
    ? await db
        .select({ total: sql<number>`count(*)::int` })
        .from(userActivationTokensTable)
        .where(eq(userActivationTokensTable.userId, userByEmail.id))
    : [{ total: 0 }];
  const databaseChecks = {
    accessRequestsTableOk: await tableExists("access_requests"),
    userEntitlementsTableOk: await tableExists("user_entitlements"),
    activationTokensTableOk: await tableExists("user_activation_tokens"),
  };
  const blockingReasons: string[] = [];
  if (!request) blockingReasons.push("Solicitação não encontrada.");
  if (request?.status === "rejected")
    blockingReasons.push("Solicitação já foi rejeitada.");
  if (request && !planSet.has(normalizeAccessPlan(request.requestedPlan)))
    blockingReasons.push("Plano solicitado inválido.");
  if (request && !isValidEmail(normalizedEmail))
    blockingReasons.push("E-mail inválido.");
  if (!databaseChecks.activationTokensTableOk)
    blockingReasons.push("Tabela user_activation_tokens não encontrada.");
  return {
    request,
    userByEmail: userByEmail ?? null,
    entitlement: entitlement ?? null,
    activationTokensCount: Number(tokensCount?.total ?? 0),
    canGrantTrial: Boolean(
      request && request.status === "pending" && blockingReasons.length === 0,
    ),
    canActivate: Boolean(
      request && request.status === "pending" && blockingReasons.length === 0,
    ),
    canReject: Boolean(
      request && !["rejected", "converted"].includes(request.status),
    ),
    blockingReasons,
    databaseChecks,
  };
}

async function convertRequest(
  id: number,
  reviewerId: number,
  status: "trialing" | "active",
) {
  await ensureAccessRequestsTable();
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.id, id))
      .limit(1);
    if (!request)
      throw Object.assign(new Error("Solicitação não encontrada."), {
        statusCode: 404,
      });
    if (request.status === "rejected")
      throw Object.assign(new Error("Solicitação já foi rejeitada."), {
        statusCode: 409,
      });
    if (request.status !== "pending")
      throw Object.assign(
        new Error(
          `Solicitação não está pendente (status atual: ${request.status}).`,
        ),
        { statusCode: 409 },
      );
    const email = normalizeEmail(request.email);
    const plan = normalizeAccessPlan(request.requestedPlan);
    if (!isValidEmail(email))
      throw Object.assign(new Error("E-mail da solicitação inválido."), {
        statusCode: 400,
      });
    if (!planSet.has(plan))
      throw Object.assign(new Error("Plano solicitado inválido."), {
        statusCode: 400,
      });
    let [user] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email}`)
      .limit(1);
    if (!user)
      [user] = await tx
        .insert(usersTable)
        .values({
          name: request.name,
          email,
          passwordHash: null,
          status: "active",
        })
        .returning({ id: usersTable.id });
    const now = new Date();
    await tx
      .insert(userEntitlementsTable)
      .values({
        userId: user.id,
        plan,
        status,
        source: "manual",
        provider: "manual",
        trialEndsAt:
          status === "trialing" ? new Date(Date.now() + 14 * 86400000) : null,
        activatedAt: status === "active" ? now : null,
      })
      .onConflictDoUpdate({
        target: userEntitlementsTable.userId,
        set: {
          plan,
          status,
          source: "manual",
          provider: "manual",
          trialEndsAt:
            status === "trialing" ? new Date(Date.now() + 14 * 86400000) : null,
          activatedAt: status === "active" ? now : null,
          updatedAt: now,
        },
      });
    await tx
      .update(accessRequestsTable)
      .set({
        status: status === "trialing" ? "approved" : "converted",
        createdUserId: user.id,
        reviewedBy: reviewerId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(accessRequestsTable.id, id));
    const activationUrl = await createActivationToken(user.id, tx);
    return {
      request,
      user,
      activationUrl,
      accessRequestStatus: status === "trialing" ? "approved" : "converted",
    };
  });
}

export async function handleAccessRequestAction(
  req: any,
  res: any,
  action: "grant-trial" | "activate" | "reject",
) {
  try {
    const context = await resolveAuthenticatedContext(req);
    const id = Number(req.params.id);
    if (!context || !context.platformRole) {
      actionError(res, 401, "Autenticação necessária.");
      return;
    }
    if (!["platform_owner", "platform_admin"].includes(context.platformRole)) {
      actionError(res, 403, "Acesso negado.");
      return;
    }
    if (!Number.isInteger(id)) {
      actionError(res, 400, "Solicitação inválida.");
      return;
    }
    if (action === "reject") {
      await ensureAccessRequestsTable();
      const [request] = await db
        .select()
        .from(accessRequestsTable)
        .where(eq(accessRequestsTable.id, id))
        .limit(1);
      if (!request) {
        actionError(res, 404, "Solicitação não encontrada.");
        return;
      }
      if (["rejected", "converted"].includes(request.status)) {
        actionError(
          res,
          409,
          `Solicitação não pode ser rejeitada (status atual: ${request.status}).`,
        );
        return;
      }
      await db
        .update(accessRequestsTable)
        .set({
          status: "rejected",
          reviewedBy: context.user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(accessRequestsTable.id, id));
      res.json({
        ok: true,
        action,
        requestId: id,
        userId: request.createdUserId ?? null,
        status: "rejected",
        accessRequestStatus: "rejected",
      });
      return;
    }
    const result = await convertRequest(
      id,
      context.user.id,
      action === "grant-trial" ? "trialing" : "active",
    );
    res.json({
      ok: true,
      action,
      requestId: id,
      userId: result.user.id,
      status: action === "grant-trial" ? "trialing" : "active",
      accessRequestStatus: result.accessRequestStatus,
      activationUrl: result.activationUrl,
      ...(!process.env.APP_PUBLIC_URL
        ? {
            warning:
              "APP_PUBLIC_URL não configurado; activationUrl retornou relativo.",
          }
        : {}),
    });
  } catch (error) {
    actionError(
      res,
      Number((error as { statusCode?: number }).statusCode ?? 500),
      error instanceof Error
        ? error.message
        : "Falha ao executar ação da solicitação.",
      error,
    );
  }
}

export async function handleAccessRequestDebug(req: any, res: any) {
  const context = await resolveAuthenticatedContext(req);
  const id = Number(req.params.id);
  if (!context || !context.platformRole) {
    actionError(res, 401, "Autenticação necessária.");
    return;
  }
  if (!["platform_owner", "platform_admin"].includes(context.platformRole)) {
    actionError(res, 403, "Acesso negado.");
    return;
  }
  if (!Number.isInteger(id)) {
    actionError(res, 400, "Solicitação inválida.");
    return;
  }
  try {
    res.json(await getAccessRequestDebugData(id));
  } catch (error) {
    actionError(
      res,
      500,
      "Não foi possível diagnosticar a solicitação.",
      error,
    );
  }
}

export default router;
