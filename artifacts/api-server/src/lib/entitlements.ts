import { eq } from "drizzle-orm";
import { db, userEntitlementsTable, type EntitlementPlan } from "@workspace/db";

export const storeCreationBlockedMessage =
  "Para criar sua loja, escolha um plano ou solicite liberação de teste.";

export function isEntitledToCreateStore(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export async function getUserEntitlement(userId: number) {
  const [entitlement] = await db
    .select()
    .from(userEntitlementsTable)
    .where(eq(userEntitlementsTable.userId, userId))
    .limit(1);
  return entitlement ?? null;
}

export async function ensurePendingEntitlement(userId: number, plan: EntitlementPlan | null = null) {
  const [entitlement] = await db
    .insert(userEntitlementsTable)
    .values({ userId, plan, status: "pending", source: "system" })
    .onConflictDoUpdate({
      target: userEntitlementsTable.userId,
      set: { plan, status: "pending", source: "system", updatedAt: new Date() },
    })
    .returning();
  return entitlement;
}

export function serializeEntitlement(entitlement: { plan: string | null; status: string; trialEndsAt: Date | null } | null) {
  if (!entitlement) return null;
  return {
    plan: entitlement.plan,
    status: entitlement.status,
    trialEndsAt: entitlement.trialEndsAt?.toISOString() ?? null,
  };
}

export function canUseFeature(plan: string | null | undefined, feature: "delivery" | "fiscal"): boolean {
  if (plan === "pro") return true;
  if (plan === "medio") return feature === "delivery";
  return false;
}
