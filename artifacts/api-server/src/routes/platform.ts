import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  accessRequestsTable,
  billingProviderProductsTable,
  billingWebhookEventsTable,
  cashRegistersTable,
  db,
  ordersTable,
  platformAdminsTable,
  platformAuditLogsTable,
  platformSupportSessionsTable,
  storeMembersTable,
  storesTable,
  userEntitlementsTable,
  usersTable,
  userActivationTokensTable,
} from "@workspace/db";
import { handleAccessRequestAction } from "./billing";
import { requirePlatformRole } from "../middleware/platform-rbac";
import {
  clearSupportSessionCookie,
  normalizeEmail,
  resolveAuthenticatedContext,
  setSupportSessionCookie,
} from "../lib/auth";
import { logPlatformAuditAction } from "../lib/platform-audit";
import { ensureAccessRequestsTable } from "../lib/ensure-billing-schema";

const router: IRouter = Router();

const canReadStores = requirePlatformRole(
  "platform_owner",
  "platform_admin",
  "platform_support",
);
const canManageBilling = requirePlatformRole(
  "platform_owner",
  "platform_admin",
);
const canManageStores = requirePlatformRole("platform_owner", "platform_admin");
const ownerOnly = requirePlatformRole("platform_owner");

router.get(
  "/platform/overview",
  canReadStores,
  async (_req, res): Promise<void> => {
    const [storesTotal] = await db.select({ total: count() }).from(storesTable);
    const [activeStores] = await db
      .select({ total: count() })
      .from(storesTable)
      .where(eq(storesTable.status, "active"));
    const [usersTotal] = await db.select({ total: count() }).from(usersTable);
    const [ordersToday] = await db
      .select({ total: count() })
      .from(ordersTable)
      .where(sql`date(${ordersTable.createdAt}) = current_date`);
    const [trialStores] = await db
      .select({ total: count() })
      .from(storesTable)
      .where(sql`lower(${storesTable.status}) in ('trial', 'teste', 'test')`);
    const [blockedStores] = await db
      .select({ total: count() })
      .from(storesTable)
      .where(
        sql`lower(${storesTable.status}) in ('blocked', 'bloqueada', 'bloqueado', 'suspended')`,
      );
    const [pendingAccessRequests] = await db
      .select({ total: count() })
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.status, "pending"));
    const [failedWebhooks] = await db
      .select({ total: count() })
      .from(billingWebhookEventsTable)
      .where(
        sql`lower(${billingWebhookEventsTable.processingStatus}) in ('failed', 'error')`,
      );
    const [activeSubscriptions] = await db
      .select({ total: count() })
      .from(userEntitlementsTable)
      .where(eq(userEntitlementsTable.status, "active"));
    const [blockedSubscriptions] = await db
      .select({ total: count() })
      .from(userEntitlementsTable)
      .where(
        sql`lower(${userEntitlementsTable.status}) in ('blocked', 'cancelled', 'past_due')`,
      );
    res.json({
      totalStores: storesTotal?.total ?? 0,
      activeStores: activeStores?.total ?? 0,
      totalUsers: usersTotal?.total ?? 0,
      ordersToday: ordersToday?.total ?? 0,
      trialStores: trialStores?.total ?? 0,
      blockedStores: blockedStores?.total ?? 0,
      pendingAccessRequests: pendingAccessRequests?.total ?? 0,
      failedWebhooks: failedWebhooks?.total ?? 0,
      activeSubscriptions: activeSubscriptions?.total ?? 0,
      blockedSubscriptions: blockedSubscriptions?.total ?? 0,
    });
  },
);

router.get(
  "/platform/stores",
  canReadStores,
  async (_req, res): Promise<void> => {
    const memberCounts = db
      .select({
        storeId: storeMembersTable.storeId,
        membersCount: count(storeMembersTable.id).as("members_count"),
      })
      .from(storeMembersTable)
      .groupBy(storeMembersTable.storeId)
      .as("member_counts");
    const stores = await db
      .select({
        id: storesTable.id,
        name: storesTable.name,
        slug: storesTable.slug,
        status: storesTable.status,
        city: sql<string | null>`null`,
        state: sql<string | null>`null`,
        createdAt: storesTable.createdAt,
        membersCount: sql<number>`coalesce(${memberCounts.membersCount}, 0)`,
      })
      .from(storesTable)
      .leftJoin(memberCounts, eq(memberCounts.storeId, storesTable.id))
      .orderBy(storesTable.id);
    res.json({ stores });
  },
);

router.get(
  "/platform/stores/:storeId",
  canReadStores,
  async (req, res): Promise<void> => {
    const storeId = Number(req.params.storeId);
    if (!Number.isInteger(storeId)) {
      res.status(400).json({ error: "Loja inválida." });
      return;
    }
    const [store] = await db
      .select({
        id: storesTable.id,
        name: storesTable.name,
        slug: storesTable.slug,
        status: storesTable.status,
        createdAt: storesTable.createdAt,
      })
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1);
    if (!store) {
      res.status(404).json({ error: "Loja não encontrada." });
      return;
    }
    const members = await db
      .select({
        id: storeMembersTable.id,
        userId: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: storeMembersTable.role,
        active: storeMembersTable.active,
        entitlementPlan: userEntitlementsTable.plan,
        entitlementStatus: userEntitlementsTable.status,
      })
      .from(storeMembersTable)
      .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
      .leftJoin(
        userEntitlementsTable,
        eq(userEntitlementsTable.userId, usersTable.id),
      )
      .where(eq(storeMembersTable.storeId, storeId))
      .orderBy(storeMembersTable.id);
    const [totals] = await db
      .select({
        todayOrders: count(ordersTable.id),
        todayRevenue: sql<string>`coalesce(sum(${ordersTable.totalAmount}), 0)`,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.storeId, storeId),
          sql`date(${ordersTable.createdAt}) = current_date`,
        ),
      );
    const owner =
      members.find((member) => member.role === "owner") ?? members[0];
    res.json({
      store: { ...store, membersCount: members.length },
      members,
      entitlement: owner
        ? {
            plan: owner.entitlementPlan,
            status: owner.entitlementStatus,
            userId: owner.userId,
          }
        : null,
      today: {
        orders: totals?.todayOrders ?? 0,
        revenue: Number(totals?.todayRevenue ?? 0),
        openCashRegister: false,
      },
      todayOrders: totals?.todayOrders ?? 0,
      todayRevenue: Number(totals?.todayRevenue ?? 0),
    });
  },
);

router.get(
  "/platform/orphan-users",
  canReadStores,
  async (_req, res): Promise<void> => {
    const activeMembers = db
      .select({
        userId: storeMembersTable.userId,
        activeStoresCount: count(storeMembersTable.id).as(
          "active_stores_count",
        ),
      })
      .from(storeMembersTable)
      .where(eq(storeMembersTable.active, true))
      .groupBy(storeMembersTable.userId)
      .as("active_members");

    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
        platformRole: platformAdminsTable.role,
        activeStoresCount: sql<number>`coalesce(${activeMembers.activeStoresCount}, 0)`,
        entitlementStatus: userEntitlementsTable.status,
      })
      .from(usersTable)
      .leftJoin(activeMembers, eq(activeMembers.userId, usersTable.id))
      .leftJoin(
        platformAdminsTable,
        eq(platformAdminsTable.userId, usersTable.id),
      )
      .leftJoin(
        userEntitlementsTable,
        eq(userEntitlementsTable.userId, usersTable.id),
      )
      .where(sql`coalesce(${activeMembers.activeStoresCount}, 0) = 0`)
      .orderBy(usersTable.createdAt);

    res.json({ users });
  },
);

router.delete(
  "/platform/orphan-users/:userId",
  ownerOnly,
  async (req, res): Promise<void> => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    if (req.body?.confirmation !== "EXCLUIR") {
      res.status(400).json({ error: "Confirmação EXCLUIR obrigatória." });
      return;
    }

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    const [platformAdmin] = await db
      .select({ role: platformAdminsTable.role })
      .from(platformAdminsTable)
      .where(eq(platformAdminsTable.userId, userId))
      .limit(1);
    if (
      platformAdmin?.role === "platform_owner" ||
      platformAdmin?.role === "platform_admin"
    ) {
      res.status(403).json({
        error: "Não é permitido excluir platform_owner/platform_admin.",
      });
      return;
    }

    const [activeStoreMember] = await db
      .select({ id: storeMembersTable.id })
      .from(storeMembersTable)
      .where(
        sql`${storeMembersTable.userId} = ${userId} and ${storeMembersTable.active} = true`,
      )
      .limit(1);
    if (activeStoreMember) {
      res
        .status(409)
        .json({ error: "Usuário possui loja ativa e não pode ser excluído." });
      return;
    }

    const [criticalCashLink] = await db
      .select({ id: cashRegistersTable.id })
      .from(cashRegistersTable)
      .where(eq(cashRegistersTable.operatorUserId, userId))
      .limit(1);
    if (criticalCashLink) {
      res.status(409).json({
        error: "Usuário possui vínculos críticos e não pode ser excluído.",
      });
      return;
    }

    const actor = await platformActor(req);
    await db.transaction(async (tx) => {
      await tx
        .delete(userEntitlementsTable)
        .where(eq(userEntitlementsTable.userId, userId));
      await tx
        .delete(storeMembersTable)
        .where(eq(storeMembersTable.userId, userId));
      await tx.delete(usersTable).where(eq(usersTable.id, userId));
    });

    await logPlatformAuditAction(actor, "orphan_user_deleted", "user", userId);
    res.status(204).send();
  },
);

router.get(
  "/platform/entitlements",
  canManageBilling,
  async (_req, res): Promise<void> => {
    const entitlements = await db
      .select({
        userId: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        plan: userEntitlementsTable.plan,
        status: userEntitlementsTable.status,
        createdAt: userEntitlementsTable.createdAt,
        trialEndsAt: userEntitlementsTable.trialEndsAt,
        provider: userEntitlementsTable.provider,
        externalOrderId: userEntitlementsTable.externalOrderId,
        externalSubscriptionId: userEntitlementsTable.externalSubscriptionId,
        currentPeriodEnd: userEntitlementsTable.currentPeriodEnd,
      })
      .from(userEntitlementsTable)
      .innerJoin(usersTable, eq(userEntitlementsTable.userId, usersTable.id))
      .orderBy(userEntitlementsTable.createdAt);
    res.json({ entitlements });
  },
);

router.get(
  "/platform/billing/webhooks",
  canManageBilling,
  async (_req, res): Promise<void> => {
    const webhooks = await db
      .select({
        id: billingWebhookEventsTable.id,
        createdAt: billingWebhookEventsTable.createdAt,
        eventType: billingWebhookEventsTable.eventType,
        paymentStatus: billingWebhookEventsTable.paymentStatus,
        processingStatus: billingWebhookEventsTable.processingStatus,
        email: billingWebhookEventsTable.email,
        plan: billingWebhookEventsTable.plan,
        externalOrderId: billingWebhookEventsTable.externalOrderId,
        externalSubscriptionId:
          billingWebhookEventsTable.externalSubscriptionId,
        rawPayload: billingWebhookEventsTable.rawPayload,
        errorMessage: billingWebhookEventsTable.errorMessage,
      })
      .from(billingWebhookEventsTable)
      .orderBy(desc(billingWebhookEventsTable.createdAt))
      .limit(100);
    res.json({ webhooks });
  },
);

router.get(
  "/platform/billing/products",
  canManageBilling,
  async (_req, res): Promise<void> => {
    const products = await db
      .select()
      .from(billingProviderProductsTable)
      .orderBy(billingProviderProductsTable.id);
    res.json({ products });
  },
);

router.post(
  "/platform/billing/products",
  canManageBilling,
  async (req, res): Promise<void> => {
    const plan = typeof req.body?.plan === "string" ? req.body.plan : "";
    if (!["basico", "medio", "pro"].includes(plan)) {
      res.status(400).json({ error: "Plano inválido." });
      return;
    }
    const [product] = await db
      .insert(billingProviderProductsTable)
      .values({
        provider: "cakto",
        externalProductId: req.body?.externalProductId || null,
        externalProductShortId: req.body?.externalProductShortId || null,
        externalOfferId: req.body?.externalOfferId || null,
        productName: req.body?.productName || null,
        offerName: req.body?.offerName || null,
        checkoutUrl: req.body?.checkoutUrl || null,
        active: req.body?.active !== false,
        plan,
      })
      .returning();
    await logPlatformAuditAction(
      await platformActor(req),
      "cakto_product_created",
      "billing_product",
      product.id,
      { plan },
    );
    res.status(201).json({ product });
  },
);

router.patch(
  "/platform/billing/products/:id",
  canManageBilling,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Produto inválido." });
      return;
    }
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "productName",
      "offerName",
      "externalProductId",
      "externalProductShortId",
      "externalOfferId",
      "checkoutUrl",
    ] as const) {
      if (key in req.body) set[key] = req.body[key] || null;
    }
    if ("active" in req.body) set.active = req.body.active === true;
    if ("plan" in req.body) {
      if (!["basico", "medio", "pro"].includes(req.body.plan)) {
        res.status(400).json({ error: "Plano inválido." });
        return;
      }
      set.plan = req.body.plan;
    }
    const [product] = await db
      .update(billingProviderProductsTable)
      .set(set)
      .where(eq(billingProviderProductsTable.id, id))
      .returning();
    if (!product) {
      res.status(404).json({ error: "Produto não encontrado." });
      return;
    }
    await logPlatformAuditAction(
      await platformActor(req),
      "cakto_product_updated",
      "billing_product",
      product.id,
      set,
    );
    res.json({ product });
  },
);

router.get(
  "/platform/access-requests",
  canManageBilling,
  async (_req, res): Promise<void> => {
    await ensureAccessRequestsTable();
    const requests = await db
      .select()
      .from(accessRequestsTable)
      .orderBy(desc(accessRequestsTable.createdAt));
    res.json({ requests });
  },
);
router.post(
  "/platform/access-requests/:id/grant-trial",
  canManageBilling,
  (req, res) => handleAccessRequestAction(req, res, "grant-trial"),
);
router.post(
  "/platform/access-requests/:id/activate",
  canManageBilling,
  (req, res) => handleAccessRequestAction(req, res, "activate"),
);
router.post(
  "/platform/access-requests/:id/reject",
  canManageBilling,
  (req, res) => handleAccessRequestAction(req, res, "reject"),
);

async function updateEntitlement(userId: number, set: Record<string, unknown>) {
  await db
    .insert(userEntitlementsTable)
    .values({ userId, ...set })
    .onConflictDoUpdate({
      target: userEntitlementsTable.userId,
      set: { ...set, updatedAt: new Date() },
    });
}

router.post(
  "/platform/entitlements/:userId/grant-trial",
  canManageBilling,
  async (req, res): Promise<void> => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await updateEntitlement(userId, {
      status: "trialing",
      source: "manual",
      trialEndsAt,
    });
    await logPlatformAuditAction(
      await platformActor(req),
      "entitlement_trial_granted",
      "user",
      userId,
    );
    res.json({ ok: true });
  },
);
router.post(
  "/platform/entitlements/:userId/activate",
  canManageBilling,
  async (req, res): Promise<void> => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    await updateEntitlement(userId, {
      status: "active",
      source: "manual",
      activatedAt: new Date(),
    });
    await logPlatformAuditAction(
      await platformActor(req),
      "entitlement_activated",
      "user",
      userId,
    );
    res.json({ ok: true });
  },
);
router.post(
  "/platform/entitlements/:userId/block",
  canManageBilling,
  async (req, res): Promise<void> => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    await updateEntitlement(userId, {
      status: "blocked",
      source: "manual",
      blockedAt: new Date(),
    });
    await logPlatformAuditAction(
      await platformActor(req),
      "entitlement_blocked",
      "user",
      userId,
    );
    res.json({ ok: true });
  },
);
router.post(
  "/platform/entitlements/:userId/cancel",
  canManageBilling,
  async (req, res): Promise<void> => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    await updateEntitlement(userId, {
      status: "cancelled",
      source: "manual",
      cancelledAt: new Date(),
    });
    await logPlatformAuditAction(
      await platformActor(req),
      "entitlement_cancelled",
      "user",
      userId,
    );
    res.json({ ok: true });
  },
);

router.patch(
  "/platform/stores/:storeId/status",
  canManageStores,
  async (req, res): Promise<void> => {
    const storeId = Number(req.params.storeId);
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (
      !Number.isInteger(storeId) ||
      !["active", "blocked", "archived"].includes(status)
    ) {
      res.status(400).json({ error: "Status inválido." });
      return;
    }
    const [store] = await db
      .update(storesTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(storesTable.id, storeId))
      .returning();
    if (!store) {
      res.status(404).json({ error: "Loja não encontrada." });
      return;
    }
    const action =
      status === "active"
        ? "store_reactivated"
        : status === "blocked"
          ? "store_blocked"
          : "store_archived";
    await logPlatformAuditAction(
      await platformActor(req),
      action,
      "store",
      storeId,
      { status },
    );
    res.json({ store });
  },
);

router.delete(
  "/platform/stores/:storeId",
  ownerOnly,
  async (req, res): Promise<void> => {
    const context = await resolveAuthenticatedContext(req);
    const storeId = Number(req.params.storeId);
    if (!Number.isInteger(storeId)) {
      res.status(400).json({ error: "Loja inválida." });
      return;
    }
    if (req.body?.confirmation !== "EXCLUIR") {
      res.status(400).json({ error: "Confirmação EXCLUIR obrigatória." });
      return;
    }
    if (context?.currentStore?.id === storeId) {
      res
        .status(409)
        .json({ error: "Não é permitido excluir a loja atualmente em uso." });
      return;
    }
    const [store] = await db
      .select({
        id: storesTable.id,
        slug: storesTable.slug,
        status: storesTable.status,
      })
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1);
    if (!store) {
      res.status(404).json({ error: "Loja não encontrada." });
      return;
    }
    if (
      ["loja-demo", "default-store"].includes(store.slug) ||
      ["demo", "protected"].includes(store.status)
    ) {
      res
        .status(403)
        .json({ error: "Loja demo/protegida não pode ser excluída." });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`delete from delivery_route_orders where route_id in (select id from delivery_routes where store_id = ${storeId})`,
      );
      await tx.execute(
        sql`delete from order_item_addons where order_item_id in (select id from order_items where order_id in (select id from orders where store_id = ${storeId}))`,
      );
      await tx.execute(
        sql`delete from order_items where order_id in (select id from orders where store_id = ${storeId})`,
      );
      await tx.execute(
        sql`delete from payments where order_id in (select id from orders where store_id = ${storeId})`,
      );
      await tx.execute(
        sql`delete from kitchen_tickets where order_id in (select id from orders where store_id = ${storeId})`,
      );
      await tx.execute(
        sql`delete from cash_movements where cash_register_id in (select id from cash_registers where store_id = ${storeId})`,
      );
      await tx.execute(
        sql`delete from variant_template_options where template_id in (select id from variant_templates where store_id = ${storeId})`,
      );
      for (const table of [
        "external_store_integrations",
        "external_order_events",
        "delivery_routes",
        "orders",
        "cash_registers",
        "product_addon_groups",
        "addon_options",
        "addon_groups",
        "product_variants",
        "variant_templates",
        "products",
        "categories",
        "customers",
        "tables",
        "couriers",
        "store_settings",
        "store_members",
      ] as const) {
        await tx.execute(
          sql.raw(`delete from "${table}" where store_id = ${storeId}`),
        );
      }
      await tx.delete(storesTable).where(eq(storesTable.id, storeId));
    });
    await logPlatformAuditAction(
      context?.user ?? null,
      "store_deleted",
      "store",
      storeId,
      { slug: store.slug },
    );
    res.status(204).send();
  },
);

function envFlag(name: string): boolean {
  return Boolean(process.env[name]);
}
function caktoStatus(mappedProducts = 0) {
  const checkoutStartConfigured =
    envFlag("CAKTO_CHECKOUT_START_URL") ||
    envFlag("VITE_CAKTO_CHECKOUT_START_URL");
  const checkoutDeliveryConfigured =
    envFlag("CAKTO_CHECKOUT_DELIVERY_URL") ||
    envFlag("VITE_CAKTO_CHECKOUT_DELIVERY_URL");
  const checkoutProConfigured =
    envFlag("CAKTO_CHECKOUT_PRO_URL") || envFlag("VITE_CAKTO_CHECKOUT_PRO_URL");
  const webhookSecretConfigured = envFlag("CAKTO_WEBHOOK_SECRET");
  const ok = [
    checkoutStartConfigured,
    checkoutDeliveryConfigured,
    checkoutProConfigured,
    webhookSecretConfigured,
  ].filter(Boolean).length;
  return {
    status:
      ok === 4
        ? "configured"
        : ok > 0 || mappedProducts > 0
          ? "partial"
          : "missing",
    webhookSecretConfigured,
    checkoutStartConfigured,
    checkoutDeliveryConfigured,
    checkoutProConfigured,
    mappedProducts,
    publicPlansOk:
      checkoutStartConfigured &&
      checkoutDeliveryConfigured &&
      checkoutProConfigured,
  };
}
function focusStatus() {
  const tokenConfigured = envFlag("FOCUS_TOKEN") || envFlag("FOCUS_NFE_TOKEN");
  const environmentConfigured =
    envFlag("FOCUS_ENV") || envFlag("FOCUS_AMBIENTE");
  return {
    status:
      tokenConfigured && environmentConfigured
        ? "configured"
        : tokenConfigured || environmentConfigured
          ? "partial"
          : "not_implemented",
    tokenConfigured,
    environmentConfigured,
    message:
      "Focus ainda não emite nota fiscal neste MVP, mas o diagnóstico está preparado.",
  };
}
async function platformActor(req: import("express").Request) {
  return (await resolveAuthenticatedContext(req))?.user ?? null;
}
async function statusCounts(
  table: unknown,
  column: unknown,
  statuses: string[],
) {
  const rows = await db
    .select({ status: column as never, total: count() })
    .from(table as never)
    .groupBy(column as never);
  return Object.fromEntries(
    rows.map((r: any) => [String(r.status), Number(r.total ?? 0)]),
  );
}

router.get(
  "/platform/control-center",
  canReadStores,
  async (_req, res): Promise<void> => {
    const [storesTotal] = await db.select({ total: count() }).from(storesTable);
    const [usersTotal] = await db.select({ total: count() }).from(usersTable);
    const storeCounts = await statusCounts(storesTable, storesTable.status, []);
    const entitlementCounts = await statusCounts(
      userEntitlementsTable,
      userEntitlementsTable.status,
      [],
    );
    const [ordersToday] = await db
      .select({ total: count() })
      .from(ordersTable)
      .where(sql`date(${ordersTable.createdAt}) = current_date`);
    const [pendingAccessRequests] = await db
      .select({ total: count() })
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.status, "pending"));
    const [mappedProducts] = await db
      .select({ total: count() })
      .from(billingProviderProductsTable);
    const [activeProducts] = await db
      .select({ total: count() })
      .from(billingProviderProductsTable)
      .where(eq(billingProviderProductsTable.active, true));
    const [webhooksToday] = await db
      .select({ total: count() })
      .from(billingWebhookEventsTable)
      .where(sql`date(${billingWebhookEventsTable.createdAt}) = current_date`);
    const [webhooksFailed] = await db
      .select({ total: count() })
      .from(billingWebhookEventsTable)
      .where(
        sql`lower(${billingWebhookEventsTable.processingStatus}) in ('failed','error')`,
      );
    const [webhooksUnrecognized] = await db
      .select({ total: count() })
      .from(billingWebhookEventsTable)
      .where(
        sql`lower(coalesce(${billingWebhookEventsTable.processingStatus}, '')) in ('unrecognized','ignored')`,
      );
    const recentStores = await db
      .select({
        id: storesTable.id,
        name: storesTable.name,
        slug: storesTable.slug,
        status: storesTable.status,
        createdAt: storesTable.createdAt,
      })
      .from(storesTable)
      .orderBy(desc(storesTable.createdAt))
      .limit(5);
    const pending = await db
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.status, "pending"))
      .orderBy(desc(accessRequestsTable.createdAt))
      .limit(5);
    const webhooks = await db
      .select({
        id: billingWebhookEventsTable.id,
        createdAt: billingWebhookEventsTable.createdAt,
        eventType: billingWebhookEventsTable.eventType,
        processingStatus: billingWebhookEventsTable.processingStatus,
        email: billingWebhookEventsTable.email,
        plan: billingWebhookEventsTable.plan,
        errorMessage: billingWebhookEventsTable.errorMessage,
      })
      .from(billingWebhookEventsTable)
      .orderBy(desc(billingWebhookEventsTable.createdAt))
      .limit(5);
    const logs = await db
      .select()
      .from(platformAuditLogsTable)
      .orderBy(desc(platformAuditLogsTable.createdAt))
      .limit(5);
    const sessions = await db
      .select()
      .from(platformSupportSessionsTable)
      .where(eq(platformSupportSessionsTable.status, "active"))
      .orderBy(desc(platformSupportSessionsTable.startedAt))
      .limit(10);
    res.json({
      overview: {
        totalStores: storesTotal?.total ?? 0,
        activeStores: storeCounts.active ?? 0,
        trialStores: (storeCounts.trial ?? 0) + (storeCounts.teste ?? 0),
        blockedStores: storeCounts.blocked ?? 0,
        archivedStores: storeCounts.archived ?? 0,
        totalUsers: usersTotal?.total ?? 0,
        ordersToday: ordersToday?.total ?? 0,
      },
      billing: {
        activeEntitlements: entitlementCounts.active ?? 0,
        trialingEntitlements: entitlementCounts.trialing ?? 0,
        blockedEntitlements: entitlementCounts.blocked ?? 0,
        cancelledEntitlements: entitlementCounts.cancelled ?? 0,
        pastDueEntitlements: entitlementCounts.past_due ?? 0,
        pendingAccessRequests: pendingAccessRequests?.total ?? 0,
        caktoProductsMapped: mappedProducts?.total ?? 0,
        caktoProductsActive: activeProducts?.total ?? 0,
        webhooksToday: webhooksToday?.total ?? 0,
        webhooksFailed: webhooksFailed?.total ?? 0,
        webhooksUnrecognized: webhooksUnrecognized?.total ?? 0,
      },
      systems: {
        api: { status: "online" },
        database: { status: "connected" },
        auth: { status: "online" },
        multiStore: { status: "active" },
        adminMax: { status: "active" },
        cakto: caktoStatus(mappedProducts?.total ?? 0),
        focus: focusStatus(),
        app: {
          publicUrlConfigured: envFlag("APP_PUBLIC_URL"),
          nodeEnv: process.env.NODE_ENV ?? "development",
        },
      },
      recentStores,
      pendingAccessRequests: pending,
      recentWebhooks: webhooks,
      recentAuditLogs: logs,
      activeSupportSessions: sessions,
    });
  },
);

router.get(
  "/platform/system-status",
  canReadStores,
  async (_req, res): Promise<void> => {
    const [mappedProducts] = await db
      .select({ total: count() })
      .from(billingProviderProductsTable);
    const [lastWebhook] = await db
      .select({
        id: billingWebhookEventsTable.id,
        createdAt: billingWebhookEventsTable.createdAt,
        processingStatus: billingWebhookEventsTable.processingStatus,
        errorMessage: billingWebhookEventsTable.errorMessage,
      })
      .from(billingWebhookEventsTable)
      .orderBy(desc(billingWebhookEventsTable.createdAt))
      .limit(1);
    const [pendingAccessRequests] = await db
      .select({ total: count() })
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.status, "pending"));
    res.json({
      api: {
        status: "online",
        nodeEnv: process.env.NODE_ENV ?? "development",
        serverTime: new Date().toISOString(),
        version: process.env.GIT_SHA ?? null,
      },
      database: {
        databaseUrlConfigured: envFlag("DATABASE_URL"),
        connection: "ok",
        criticalTables: [
          "stores",
          "users",
          "store_members",
          "user_entitlements",
          "access_requests",
          "billing_provider_products",
          "billing_webhook_events",
          "platform_audit_logs",
          "platform_support_sessions",
        ].map((name) => ({ name, status: "expected" })),
      },
      cakto: {
        ...caktoStatus(mappedProducts?.total ?? 0),
        appPublicUrlConfigured: envFlag("APP_PUBLIC_URL"),
        lastWebhook,
      },
      focus: focusStatus(),
      publicPlans: {
        ok: true,
        startEnabled: true,
        deliveryEnabled: true,
        proEnabled: true,
        checkoutUrlPresence: {
          start:
            envFlag("CAKTO_CHECKOUT_START_URL") ||
            envFlag("VITE_CAKTO_CHECKOUT_START_URL"),
          delivery:
            envFlag("CAKTO_CHECKOUT_DELIVERY_URL") ||
            envFlag("VITE_CAKTO_CHECKOUT_DELIVERY_URL"),
          pro:
            envFlag("CAKTO_CHECKOUT_PRO_URL") ||
            envFlag("VITE_CAKTO_CHECKOUT_PRO_URL"),
        },
      },
      accessRequests: {
        tableExists: true,
        pending: pendingAccessRequests?.total ?? 0,
      },
    });
  },
);

router.get(
  "/platform/support/current",
  canReadStores,
  async (req, res): Promise<void> => {
    const context = await resolveAuthenticatedContext(req);
    if (!context?.supportMode) {
      res.json({ active: false });
      return;
    }
    res.json({
      active: true,
      session: {
        id: context.supportSessionId,
        storeId: context.currentStore?.id,
        storeName: context.supportStoreName ?? context.currentStore?.name,
        mode: context.supportModeType,
        reason: context.supportReason,
        actorEmail: context.supportActorEmail,
      },
    });
  },
);

router.post(
  "/platform/support/sessions",
  canReadStores,
  async (req, res): Promise<void> => {
    const context = await resolveAuthenticatedContext(req);
    if (!context?.platformRole) {
      res.status(403).json({ error: "Acesso negado." });
      return;
    }
    const storeId = Number(req.body?.storeId);
    const mode = req.body?.mode === "full_access" ? "full_access" : "read_only";
    const reason = String(req.body?.reason ?? "").trim();
    if (!Number.isInteger(storeId)) {
      res.status(400).json({ error: "Loja inválida." });
      return;
    }
    if (!reason) {
      res.status(400).json({ error: "Motivo obrigatório." });
      return;
    }
    if (context.platformRole === "platform_support" && mode === "full_access") {
      res.status(403).json({
        error: "platform_support só pode iniciar suporte somente leitura.",
      });
      return;
    }
    const [store] = await db
      .select({
        id: storesTable.id,
        name: storesTable.name,
        status: storesTable.status,
      })
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1);
    if (!store) {
      res.status(404).json({ error: "Loja não encontrada." });
      return;
    }
    if (["archived", "deleted"].includes(store.status)) {
      res
        .status(409)
        .json({ error: "Loja arquivada/excluída não permite suporte." });
      return;
    }
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const [session] = await db
      .insert(platformSupportSessionsTable)
      .values({
        actorUserId: context.user.id,
        actorEmail: context.user.email,
        targetStoreId: store.id,
        targetStoreName: store.name,
        mode,
        reason,
        expiresAt,
      })
      .returning();
    setSupportSessionCookie(res, {
      supportSessionId: session.id,
      actorUserId: context.user.id,
      targetStoreId: store.id,
      mode,
      exp: expiresAt.getTime(),
    });
    await logPlatformAuditAction(
      context.user,
      "support_session_started",
      "store",
      store.id,
      { mode, reason, supportSessionId: session.id },
    );
    res
      .status(201)
      .json({ ok: true, supportSession: session, redirectTo: "/dashboard" });
  },
);

router.post(
  "/platform/support/end",
  canReadStores,
  async (req, res): Promise<void> => {
    const context = await resolveAuthenticatedContext(req);
    if (context?.supportSessionId) {
      await db
        .update(platformSupportSessionsTable)
        .set({ status: "ended", endedAt: new Date(), endedReason: "manual" })
        .where(eq(platformSupportSessionsTable.id, context.supportSessionId));
      await logPlatformAuditAction(
        context.user,
        "support_session_ended",
        "support_session",
        context.supportSessionId,
        { storeId: context.currentStore?.id },
      );
    }
    clearSupportSessionCookie(res);
    res.json({ ok: true });
  },
);

router.get(
  "/platform/support/sessions",
  canReadStores,
  async (req, res): Promise<void> => {
    const q = String(req.query.search ?? "").toLowerCase();
    const rows = await db
      .select()
      .from(platformSupportSessionsTable)
      .orderBy(desc(platformSupportSessionsTable.startedAt))
      .limit(100);
    res.json({
      sessions: q
        ? rows.filter((r) =>
            `${r.actorEmail} ${r.targetStoreName} ${r.reason}`
              .toLowerCase()
              .includes(q),
          )
        : rows,
    });
  },
);

router.get(
  "/platform/audit-logs",
  canReadStores,
  async (req, res): Promise<void> => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 250);
    const rows = await db
      .select()
      .from(platformAuditLogsTable)
      .orderBy(desc(platformAuditLogsTable.createdAt))
      .limit(limit);
    const search = String(req.query.search ?? "").toLowerCase();
    res.json({
      logs: search
        ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search))
        : rows,
    });
  },
);

router.post(
  "/platform/manual-access",
  canManageBilling,
  async (req, res): Promise<void> => {
    const email = normalizeEmail(String(req.body?.email ?? ""));
    const name = String(req.body?.name ?? "").trim() || email;
    const plan = String(req.body?.plan ?? "basico");
    const releaseType = String(req.body?.releaseType ?? "trial");
    if (!email.includes("@") || !["basico", "medio", "pro"].includes(plan)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const actor = await platformActor(req);
    let [user] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email}`)
      .limit(1);
    if (!user)
      [user] = await db
        .insert(usersTable)
        .values({ name, email, status: "active" })
        .returning();
    const trialEndsAt =
      releaseType === "trial"
        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        : null;
    await updateEntitlement(user.id, {
      plan,
      status: releaseType === "trial" ? "trialing" : "active",
      source: "manual",
      provider: "manual",
      trialEndsAt,
      activatedAt: releaseType === "active" ? new Date() : null,
    });
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await db.insert(userActivationTokensTable).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const activationUrl = `${process.env.APP_PUBLIC_URL ?? "http://localhost:5173"}/activate/${token}`;
    await logPlatformAuditAction(
      actor,
      "manual_access_created",
      "user",
      user.id,
      { plan, releaseType, note: req.body?.note ?? null },
    );
    res.status(201).json({ ok: true, userId: user.id, activationUrl });
  },
);

export default router;
