import { Router, type IRouter } from "express";
import { count, eq, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  platformAdminsTable,
  storeMembersTable,
  storesTable,
  userEntitlementsTable,
  usersTable,
} from "@workspace/db";
import { requirePlatformRole } from "../middleware/platform-rbac";
import { resolveAuthenticatedContext } from "../lib/auth";

const router: IRouter = Router();

const canReadStores = requirePlatformRole("platform_owner", "platform_admin", "platform_support");
const canManageBilling = requirePlatformRole("platform_owner", "platform_admin");
const canManageStores = requirePlatformRole("platform_owner", "platform_admin");
const ownerOnly = requirePlatformRole("platform_owner");

router.get("/platform/overview", canReadStores, async (_req, res): Promise<void> => {
  const [storesTotal] = await db.select({ total: count() }).from(storesTable);
  const [activeStores] = await db.select({ total: count() }).from(storesTable).where(eq(storesTable.status, "active"));
  const [usersTotal] = await db.select({ total: count() }).from(usersTable);
  const [ordersToday] = await db.select({ total: count() }).from(ordersTable).where(sql`date(${ordersTable.createdAt}) = current_date`);
  const [trialStores] = await db.select({ total: count() }).from(storesTable).where(sql`lower(${storesTable.status}) in ('trial', 'teste', 'test')`);
  const [blockedStores] = await db.select({ total: count() }).from(storesTable).where(sql`lower(${storesTable.status}) in ('blocked', 'bloqueada', 'bloqueado', 'suspended')`);
  res.json({ totalStores: storesTotal?.total ?? 0, activeStores: activeStores?.total ?? 0, totalUsers: usersTotal?.total ?? 0, ordersToday: ordersToday?.total ?? 0, trialStores: trialStores?.total ?? 0, blockedStores: blockedStores?.total ?? 0 });
});

router.get("/platform/stores", canReadStores, async (_req, res): Promise<void> => {
  const memberCounts = db.select({ storeId: storeMembersTable.storeId, membersCount: count(storeMembersTable.id).as("members_count") }).from(storeMembersTable).groupBy(storeMembersTable.storeId).as("member_counts");
  const stores = await db.select({ id: storesTable.id, name: storesTable.name, slug: storesTable.slug, status: storesTable.status, city: sql<string | null>`null`, state: sql<string | null>`null`, createdAt: storesTable.createdAt, membersCount: sql<number>`coalesce(${memberCounts.membersCount}, 0)` }).from(storesTable).leftJoin(memberCounts, eq(memberCounts.storeId, storesTable.id)).orderBy(storesTable.id);
  res.json({ stores });
});

router.get("/platform/entitlements", canManageBilling, async (_req, res): Promise<void> => {
  const entitlements = await db.select({ userId: usersTable.id, name: usersTable.name, email: usersTable.email, plan: userEntitlementsTable.plan, status: userEntitlementsTable.status, createdAt: userEntitlementsTable.createdAt, trialEndsAt: userEntitlementsTable.trialEndsAt }).from(userEntitlementsTable).innerJoin(usersTable, eq(userEntitlementsTable.userId, usersTable.id)).orderBy(userEntitlementsTable.createdAt);
  res.json({ entitlements });
});

async function updateEntitlement(userId: number, set: Record<string, unknown>) {
  await db.insert(userEntitlementsTable).values({ userId, ...set }).onConflictDoUpdate({ target: userEntitlementsTable.userId, set: { ...set, updatedAt: new Date() } });
}

router.post("/platform/entitlements/:userId/grant-trial", canManageBilling, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) { res.status(400).json({ error: "Usuário inválido." }); return; }
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await updateEntitlement(userId, { status: "trialing", source: "manual", trialEndsAt });
  res.json({ ok: true });
});
router.post("/platform/entitlements/:userId/activate", canManageBilling, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) { res.status(400).json({ error: "Usuário inválido." }); return; }
  await updateEntitlement(userId, { status: "active", source: "manual", activatedAt: new Date() });
  res.json({ ok: true });
});
router.post("/platform/entitlements/:userId/block", canManageBilling, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) { res.status(400).json({ error: "Usuário inválido." }); return; }
  await updateEntitlement(userId, { status: "blocked", source: "manual" });
  res.json({ ok: true });
});

router.patch("/platform/stores/:storeId/status", canManageStores, async (req, res): Promise<void> => {
  const storeId = Number(req.params.storeId);
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!Number.isInteger(storeId) || !["active", "blocked", "archived"].includes(status)) { res.status(400).json({ error: "Status inválido." }); return; }
  const [store] = await db.update(storesTable).set({ status, updatedAt: new Date() }).where(eq(storesTable.id, storeId)).returning();
  if (!store) { res.status(404).json({ error: "Loja não encontrada." }); return; }
  res.json({ store });
});

router.delete("/platform/stores/:storeId", ownerOnly, async (req, res): Promise<void> => {
  const context = await resolveAuthenticatedContext(req);
  const storeId = Number(req.params.storeId);
  if (!Number.isInteger(storeId)) { res.status(400).json({ error: "Loja inválida." }); return; }
  if (req.body?.confirmation !== "EXCLUIR") { res.status(400).json({ error: "Confirmação EXCLUIR obrigatória." }); return; }
  if (context?.currentStore?.id === storeId) { res.status(409).json({ error: "Não é permitido excluir a loja atualmente em uso." }); return; }
  const [store] = await db.select({ id: storesTable.id, slug: storesTable.slug, status: storesTable.status }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (!store) { res.status(404).json({ error: "Loja não encontrada." }); return; }
  if (["loja-demo", "default-store"].includes(store.slug) || ["demo", "protected"].includes(store.status)) { res.status(403).json({ error: "Loja demo/protegida não pode ser excluída." }); return; }
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from delivery_route_orders where route_id in (select id from delivery_routes where store_id = ${storeId})`);
    await tx.execute(sql`delete from order_item_addons where order_item_id in (select id from order_items where order_id in (select id from orders where store_id = ${storeId}))`);
    await tx.execute(sql`delete from order_items where order_id in (select id from orders where store_id = ${storeId})`);
    await tx.execute(sql`delete from payments where order_id in (select id from orders where store_id = ${storeId})`);
    await tx.execute(sql`delete from kitchen_tickets where order_id in (select id from orders where store_id = ${storeId})`);
    await tx.execute(sql`delete from cash_movements where cash_register_id in (select id from cash_registers where store_id = ${storeId})`);
    await tx.execute(sql`delete from variant_template_options where template_id in (select id from variant_templates where store_id = ${storeId})`);
    for (const table of ["external_store_integrations", "external_order_events", "delivery_routes", "orders", "cash_registers", "product_addon_groups", "addon_options", "addon_groups", "product_variants", "variant_templates", "products", "categories", "customers", "tables", "couriers", "store_settings", "store_members"] as const) {
      await tx.execute(sql.raw(`delete from "${table}" where store_id = ${storeId}`));
    }
    await tx.delete(storesTable).where(eq(storesTable.id, storeId));
  });
  res.status(204).send();
});

export default router;
