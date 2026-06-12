import { Router, type IRouter } from "express";
import { count, eq, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  storeMembersTable,
  storesTable,
  usersTable,
} from "@workspace/db";
import { requirePlatformRole } from "../middleware/platform-rbac";

const router: IRouter = Router();

const canReadStores = requirePlatformRole(
  "platform_owner",
  "platform_admin",
  "platform_support",
);

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
