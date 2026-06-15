import { Router, type IRouter } from "express";
import { count, eq, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  storeMembersTable,
  storesTable,
  usersTable,
  userEntitlementsTable,
} from "@workspace/db";
import { requirePlatformRole } from "../middleware/platform-rbac";

const router: IRouter = Router();

const canReadStores = requirePlatformRole(
  "platform_owner",
  "platform_admin",
  "platform_support",
);
const canManageEntitlements = requirePlatformRole("platform_owner", "platform_admin");

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

    res.json({
      totalStores: storesTotal?.total ?? 0,
      activeStores: activeStores?.total ?? 0,
      totalUsers: usersTotal?.total ?? 0,
      ordersToday: ordersToday?.total ?? 0,
      trialStores: trialStores?.total ?? 0,
      blockedStores: blockedStores?.total ?? 0,
    });
  },
);

router.get(
  "/platform/entitlements",
  canManageEntitlements,
  async (_req, res): Promise<void> => {
    const entitlements = await db
      .select({
        userId: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        plan: userEntitlementsTable.plan,
        status: userEntitlementsTable.status,
        source: userEntitlementsTable.source,
        trialEndsAt: userEntitlementsTable.trialEndsAt,
        activatedAt: userEntitlementsTable.activatedAt,
        createdAt: userEntitlementsTable.createdAt,
      })
      .from(userEntitlementsTable)
      .innerJoin(usersTable, eq(userEntitlementsTable.userId, usersTable.id))
      .orderBy(userEntitlementsTable.createdAt);

    res.json({ entitlements });
  },
);

async function updateEntitlementStatus(
  userId: number,
  values: Partial<typeof userEntitlementsTable.$inferInsert>,
) {
  const [entitlement] = await db
    .insert(userEntitlementsTable)
    .values({ userId, status: "pending", source: "manual", ...values })
    .onConflictDoUpdate({
      target: userEntitlementsTable.userId,
      set: { ...values, source: "manual", updatedAt: new Date() },
    })
    .returning();
  return entitlement;
}

router.post(
  "/platform/entitlements/:userId/grant-trial",
  canManageEntitlements,
  async (req, res): Promise<void> => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);
    const entitlement = await updateEntitlementStatus(userId, {
      status: "trialing",
      trialEndsAt,
    });
    res.json({ entitlement });
  },
);

router.post(
  "/platform/entitlements/:userId/activate",
  canManageEntitlements,
  async (req, res): Promise<void> => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    const entitlement = await updateEntitlementStatus(userId, {
      status: "active",
      activatedAt: new Date(),
    });
    res.json({ entitlement });
  },
);

router.post(
  "/platform/entitlements/:userId/block",
  canManageEntitlements,
  async (req, res): Promise<void> => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    const entitlement = await updateEntitlementStatus(userId, {
      status: "blocked",
    });
    res.json({ entitlement });
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

export default router;
