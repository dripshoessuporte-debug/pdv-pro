import { eq } from "drizzle-orm";
import { db, userEntitlementsTable, type EntitlementPlan } from "@workspace/db";

export const storeCreationEntitlementStatuses = new Set(["active", "trialing"]);

export async function ensurePendingEntitlement(userId: number) {
  const [existing] = await db
    .select()
    .from(userEntitlementsTable)
    .where(eq(userEntitlementsTable.userId, userId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(userEntitlementsTable)
    .values({ userId, plan: null, status: "pending", source: "system" })
    .returning();
  return created;
}

export async function canCreateStore(userId: number): Promise<boolean> {
  const entitlement = await ensurePendingEntitlement(userId);
  return storeCreationEntitlementStatuses.has(entitlement.status);
}

export function isEntitlementPlan(value: unknown): value is EntitlementPlan {
  return value === "basico" || value === "medio" || value === "pro";
}
