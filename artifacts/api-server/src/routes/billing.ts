import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { accessRequestsTable, billingProviderProductsTable, db, entitlementPlans, storeMembersTable, storesTable, userActivationTokensTable, userEntitlementsTable, usersTable } from "@workspace/db";
import { hashPassword, isValidEmail, normalizeEmail, resolveAuthenticatedContext } from "../lib/auth";

const router: IRouter = Router();
const planSet = new Set<string>(entitlementPlans);
const planDefs = [
  { plan: "basico", name: "Gestor Max Start", description: "PDV e operação básica para começar com controle.", features: ["PDV", "Caixa", "Pedidos", "Cardápio"] },
  { plan: "medio", name: "Gestor Max Delivery", description: "Operação completa com delivery, rotas e motoboys.", features: ["PDV", "Delivery", "Rotas", "Motoboys"] },
  { plan: "pro", name: "Gestor Max Pro", description: "Completo, com fiscal preparado para ativação futura via Focus.", features: ["PDV", "Delivery", "Rotas", "Motoboys", "Fiscal em breve"] },
];
const checkoutEnv: Record<string, string | undefined> = { basico: process.env.CAKTO_CHECKOUT_START_URL, medio: process.env.CAKTO_CHECKOUT_DELIVERY_URL, pro: process.env.CAKTO_CHECKOUT_PRO_URL };
const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";
const sha = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
async function createActivationToken(userId: number) { const token = crypto.randomBytes(32).toString("base64url"); await db.insert(userActivationTokensTable).values({ userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + 14 * 86400000) }); return `${(process.env.APP_PUBLIC_URL || "").replace(/\/$/, "")}/activate/${token}`; }

router.get("/billing/public-plans", async (_req, res) => {
  const rows = await db.select({ plan: billingProviderProductsTable.plan, checkoutUrl: billingProviderProductsTable.checkoutUrl }).from(billingProviderProductsTable).where(sql`${billingProviderProductsTable.provider} = 'cakto' and ${billingProviderProductsTable.active} = true and ${billingProviderProductsTable.checkoutUrl} is not null`);
  res.json({ plans: planDefs.map((p) => { const row = rows.find((r) => r.plan === p.plan); const checkoutUrl = row?.checkoutUrl ?? checkoutEnv[p.plan] ?? null; return { ...p, checkoutUrl, enabled: Boolean(checkoutUrl) }; }) });
});

router.post("/access-requests", async (req, res): Promise<void> => {
  const name = clean(req.body?.name), email = normalizeEmail(clean(req.body?.email)), phone = clean(req.body?.phone), restaurantName = clean(req.body?.restaurantName), requestedPlan = clean(req.body?.requestedPlan || req.body?.plan), message = clean(req.body?.message) || null;
  if (!name || !isValidEmail(email) || !phone || !restaurantName || !planSet.has(requestedPlan)) { res.status(400).json({ error: "Preencha nome, e-mail, telefone, restaurante e plano desejado." }); return; }
  const [request] = await db.insert(accessRequestsTable).values({ name, email, phone, restaurantName, requestedPlan, message, status: "pending" }).returning();
  res.status(201).json({ ok: true, request: { id: request.id, status: request.status } });
});

router.post("/billing/request-access", async (req, res): Promise<void> => {
  const context = await resolveAuthenticatedContext(req);
  if (!context) { res.status(401).json({ error: "Autenticação necessária." }); return; }
  if (context.platformRole) { res.status(403).json({ error: "Admin Max não usa solicitação de plano." }); return; }
  const plan = clean(req.body?.plan); if (!planSet.has(plan)) { res.status(400).json({ error: "Plano inválido." }); return; }
  const [membership] = await db.select({ id: storeMembersTable.id }).from(storeMembersTable).innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id)).where(eq(storeMembersTable.userId, context.user.id)).limit(1);
  if (membership) { res.status(409).json({ error: "Usuário já possui loja vinculada." }); return; }
  await db.insert(userEntitlementsTable).values({ userId: context.user.id, plan, status: "pending", source: "system" }).onConflictDoUpdate({ target: userEntitlementsTable.userId, set: { plan, status: "pending", source: "system", updatedAt: new Date() } });
  res.json({ ok: true, entitlement: { plan, status: "pending", trialEndsAt: null } });
});

async function convertRequest(id: number, reviewerId: number, status: "trialing" | "active") {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(accessRequestsTable).where(eq(accessRequestsTable.id, id)).limit(1);
    if (!request) return null;
    let [user] = await tx.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${request.email}`).limit(1);
    if (!user) [user] = await tx.insert(usersTable).values({ name: request.name, email: request.email, passwordHash: null, status: "active" }).returning({ id: usersTable.id });
    await tx.insert(userEntitlementsTable).values({ userId: user.id, plan: request.requestedPlan, status, source: "manual", provider: "manual", trialEndsAt: status === "trialing" ? new Date(Date.now() + 14 * 86400000) : null, activatedAt: status === "active" ? new Date() : null }).onConflictDoUpdate({ target: userEntitlementsTable.userId, set: { plan: request.requestedPlan, status, source: "manual", provider: "manual", trialEndsAt: status === "trialing" ? new Date(Date.now() + 14 * 86400000) : null, activatedAt: status === "active" ? new Date() : null, updatedAt: new Date() } });
    await tx.update(accessRequestsTable).set({ status: status === "trialing" ? "approved" : "converted", createdUserId: user.id, reviewedBy: reviewerId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(accessRequestsTable.id, id));
    return user;
  });
}

export async function handleAccessRequestAction(req: any, res: any, action: "grant-trial" | "activate" | "reject") {
  const context = await resolveAuthenticatedContext(req); const id = Number(req.params.id);
  if (!context || !context.platformRole) { res.status(401).json({ error: "Autenticação necessária." }); return; }
  if (!["platform_owner", "platform_admin"].includes(context.platformRole)) { res.status(403).json({ error: "Acesso negado." }); return; }
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Solicitação inválida." }); return; }
  if (action === "reject") { await db.update(accessRequestsTable).set({ status: "rejected", reviewedBy: context.user.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(accessRequestsTable.id, id)); res.json({ ok: true }); return; }
  const user = await convertRequest(id, context.user.id, action === "grant-trial" ? "trialing" : "active");
  if (!user) { res.status(404).json({ error: "Solicitação não encontrada." }); return; }
  res.json({ ok: true, userId: user.id, activationUrl: await createActivationToken(user.id) });
}

export default router;
