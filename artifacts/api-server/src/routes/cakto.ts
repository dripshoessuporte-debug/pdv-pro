import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, billingProviderProductsTable, billingWebhookEventsTable, entitlementPlans, userActivationTokensTable, userEntitlementsTable, usersTable } from "@workspace/db";
import { hashPassword, isValidEmail, normalizeEmail } from "../lib/auth";

const router: IRouter = Router();
const planSet = new Set<string>(entitlementPlans);
const activationDays = 14;

type CaktoPayload = Record<string, any>;
const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";
const maybeDate = (v: unknown) => { const d = clean(v); if (!d) return null; const parsed = new Date(d); return Number.isNaN(parsed.getTime()) ? null : parsed; };
const sha = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function normalizeCaktoEventType(payload: CaktoPayload): string { return clean(payload?.event); }
export function normalizeCaktoPaymentStatus(payload: CaktoPayload): string { return clean(payload?.data?.status || payload?.data?.subscription?.status).toLowerCase(); }
export function extractCaktoCustomer(payload: CaktoPayload) { const c = payload?.data?.customer ?? {}; return { name: clean(c.name), email: normalizeEmail(clean(c.email).replace(/^\[(.*)\]\(mailto:.*\)$/i, "$1")), phone: clean(c.phone) }; }
export function extractCaktoProduct(payload: CaktoPayload) { const d = payload?.data ?? {}; return { productId: clean(d.product?.id), productShortId: clean(d.product?.short_id), productName: clean(d.product?.name), offerId: clean(d.offer?.id), offerName: clean(d.offer?.name) }; }
export function extractCaktoOrder(payload: CaktoPayload) { const d = payload?.data ?? {}; return { orderId: clean(d.id), refId: clean(d.refId), subscriptionId: clean(d.subscription?.id), amount: d.amount, paidAt: maybeDate(d.paidAt), nextPaymentDate: maybeDate(d.subscription?.next_payment_date), cancelledAt: maybeDate(d.canceledAt || d.subscription?.canceledAt), refundedAt: maybeDate(d.refundedAt), chargedbackAt: maybeDate(d.chargedbackAt), checkoutUrl: clean(d.checkoutUrl) }; }

function envPlan(product: ReturnType<typeof extractCaktoProduct>): string | null {
  const rows = [
    { plan: "basico", product: process.env.CAKTO_PRODUCT_START_ID, offer: process.env.CAKTO_OFFER_START_ID },
    { plan: "medio", product: process.env.CAKTO_PRODUCT_DELIVERY_ID, offer: process.env.CAKTO_OFFER_DELIVERY_ID },
    { plan: "pro", product: process.env.CAKTO_PRODUCT_PRO_ID, offer: process.env.CAKTO_OFFER_PRO_ID },
  ];
  return rows.find((r) => (r.offer && r.offer === product.offerId) || (r.product && (r.product === product.productId || r.product === product.productShortId)))?.plan ?? null;
}

export async function mapCaktoProductToPlan(payload: CaktoPayload): Promise<string | null> {
  const product = extractCaktoProduct(payload);
  const [byOffer] = product.offerId ? await db.select({ plan: billingProviderProductsTable.plan }).from(billingProviderProductsTable).where(and(eq(billingProviderProductsTable.provider, "cakto"), eq(billingProviderProductsTable.active, true), eq(billingProviderProductsTable.externalOfferId, product.offerId))).limit(1) : [];
  const [byProduct] = !byOffer && product.productId ? await db.select({ plan: billingProviderProductsTable.plan }).from(billingProviderProductsTable).where(and(eq(billingProviderProductsTable.provider, "cakto"), eq(billingProviderProductsTable.active, true), eq(billingProviderProductsTable.externalProductId, product.productId))).limit(1) : [];
  const [byShort] = !byOffer && !byProduct && product.productShortId ? await db.select({ plan: billingProviderProductsTable.plan }).from(billingProviderProductsTable).where(and(eq(billingProviderProductsTable.provider, "cakto"), eq(billingProviderProductsTable.active, true), eq(billingProviderProductsTable.externalProductShortId, product.productShortId))).limit(1) : [];
  const [byName] = !byOffer && !byProduct && !byShort && (product.productName || product.offerName) ? await db.select({ plan: billingProviderProductsTable.plan }).from(billingProviderProductsTable).where(sql`${billingProviderProductsTable.provider} = 'cakto' and ${billingProviderProductsTable.active} = true and (lower(${billingProviderProductsTable.productName}) = ${product.productName.toLowerCase()} or lower(${billingProviderProductsTable.offerName}) = ${product.offerName.toLowerCase()})`).limit(1) : [];
  const mapped = byOffer?.plan ?? byProduct?.plan ?? byShort?.plan ?? byName?.plan ?? envPlan(product);
  return mapped && planSet.has(mapped) ? mapped : null;
}

async function createActivationToken(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + activationDays * 24 * 60 * 60 * 1000);
  await db.insert(userActivationTokensTable).values({ userId, tokenHash: sha(token), expiresAt });
  return token;
}

function statusFromPayload(payload: CaktoPayload) {
  const event = normalizeCaktoEventType(payload).toLowerCase(); const payment = normalizeCaktoPaymentStatus(payload); const order = extractCaktoOrder(payload);
  if (order.chargedbackAt || event.includes("chargeback")) return "blocked";
  if (order.refundedAt || event.includes("refund")) return "blocked";
  if (order.cancelledAt || ["canceled", "cancelled"].includes(payment) || event.includes("cancel")) return "cancelled";
  if (event === "purchase_approved" && payment === "paid") return "active";
  if (payment === "active") return "active";
  if (["pending", "waiting"].includes(payment)) return "pending";
  if (["refused", "failed"].includes(payment)) return "past_due";
  return null;
}

router.post("/webhooks/cakto", async (req, res): Promise<void> => {
  const payload = req.body as CaktoPayload;
  if (process.env.CAKTO_WEBHOOK_SECRET && clean(payload?.secret) !== process.env.CAKTO_WEBHOOK_SECRET) { res.status(401).json({ error: "Webhook secret inválido." }); return; }
  const eventType = normalizeCaktoEventType(payload); const paymentStatus = normalizeCaktoPaymentStatus(payload); const customer = extractCaktoCustomer(payload); const order = extractCaktoOrder(payload);
  const [event] = await db.insert(billingWebhookEventsTable).values({ provider: "cakto", externalEventId: order.orderId || null, externalOrderId: order.orderId || null, externalRefId: order.refId || null, externalSubscriptionId: order.subscriptionId || null, eventType: eventType || null, paymentStatus: paymentStatus || null, email: customer.email || null, rawPayload: payload }).returning({ id: billingWebhookEventsTable.id });
  const [already] = order.orderId && eventType ? await db.select({ id: billingWebhookEventsTable.id }).from(billingWebhookEventsTable).where(sql`${billingWebhookEventsTable.id} <> ${event.id} and ${billingWebhookEventsTable.externalOrderId} = ${order.orderId} and ${billingWebhookEventsTable.eventType} = ${eventType} and ${billingWebhookEventsTable.processingStatus} = 'processed'`).limit(1) : [];
  if (already) { await db.update(billingWebhookEventsTable).set({ processingStatus: "duplicate", processedAt: new Date() }).where(eq(billingWebhookEventsTable.id, event.id)); res.json({ ok: true, duplicate: true }); return; }
  const entitlementStatus = statusFromPayload(payload);
  if (!entitlementStatus) { await db.update(billingWebhookEventsTable).set({ processingStatus: "unhandled", processedAt: new Date() }).where(eq(billingWebhookEventsTable.id, event.id)); res.status(202).json({ ok: true, status: "unhandled" }); return; }
  const plan = await mapCaktoProductToPlan(payload);
  if (!plan) { await db.update(billingWebhookEventsTable).set({ processingStatus: "unrecognized", errorMessage: "Produto/oferta Cakto não mapeado para plano interno.", processedAt: new Date() }).where(eq(billingWebhookEventsTable.id, event.id)); res.status(202).json({ ok: true, status: "unrecognized" }); return; }
  if (!customer.email || !isValidEmail(customer.email)) { await db.update(billingWebhookEventsTable).set({ processingStatus: "error", plan, errorMessage: "E-mail do cliente ausente ou inválido.", processedAt: new Date() }).where(eq(billingWebhookEventsTable.id, event.id)); res.status(202).json({ ok: false }); return; }
  const [user] = await db.transaction(async (tx) => {
    let [found] = await tx.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${customer.email}`).limit(1);
    if (!found) [found] = await tx.insert(usersTable).values({ name: customer.name || customer.email, email: customer.email, passwordHash: null, status: "active" }).returning({ id: usersTable.id });
    await tx.insert(userEntitlementsTable).values({ userId: found.id, plan, status: entitlementStatus, source: "webhook", provider: "cakto", externalOrderId: order.orderId || null, externalRefId: order.refId || null, externalSubscriptionId: order.subscriptionId || null, currentPeriodEnd: order.nextPaymentDate, activatedAt: entitlementStatus === "active" ? order.paidAt ?? new Date() : null, cancelledAt: entitlementStatus === "cancelled" ? new Date() : null, blockedAt: entitlementStatus === "blocked" ? new Date() : null }).onConflictDoUpdate({ target: userEntitlementsTable.userId, set: { plan, status: entitlementStatus, source: "webhook", provider: "cakto", externalOrderId: order.orderId || null, externalRefId: order.refId || null, externalSubscriptionId: order.subscriptionId || null, currentPeriodEnd: order.nextPaymentDate, activatedAt: entitlementStatus === "active" ? order.paidAt ?? new Date() : null, cancelledAt: entitlementStatus === "cancelled" ? new Date() : null, blockedAt: entitlementStatus === "blocked" ? new Date() : null, updatedAt: new Date() } });
    return [found];
  });
  let activationUrl: string | null = null;
  if (entitlementStatus === "active") { const token = await createActivationToken(user.id); activationUrl = `${(process.env.APP_PUBLIC_URL || "").replace(/\/$/, "")}/activate/${token}`; }
  await db.update(billingWebhookEventsTable).set({ processingStatus: "processed", plan, createdUserId: user.id, processedAt: new Date() }).where(eq(billingWebhookEventsTable.id, event.id));
  res.json({ ok: true, userId: user.id, plan, status: entitlementStatus, activationUrl });
});

router.post("/auth/activation/complete", async (req, res): Promise<void> => {
  const token = clean(req.body?.token); const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!token || password.length < 6) { res.status(400).json({ error: "Token e senha válida são obrigatórios." }); return; }
  const [row] = await db.select({ id: userActivationTokensTable.id, userId: userActivationTokensTable.userId, expiresAt: userActivationTokensTable.expiresAt, usedAt: userActivationTokensTable.usedAt }).from(userActivationTokensTable).where(eq(userActivationTokensTable.tokenHash, sha(token))).limit(1);
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) { res.status(400).json({ error: "Token inválido ou expirado." }); return; }
  await db.transaction(async (tx) => { await tx.update(usersTable).set({ passwordHash: hashPassword(password), status: "active", updatedAt: new Date() }).where(eq(usersTable.id, row.userId)); await tx.update(userActivationTokensTable).set({ usedAt: new Date() }).where(eq(userActivationTokensTable.id, row.id)); });
  res.json({ ok: true });
});
router.post("/auth/activation/start", (_req, res) => res.json({ message: "Se seu acesso estiver liberado, enviaremos instruções." }));

export default router;
