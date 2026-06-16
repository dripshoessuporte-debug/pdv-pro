import { pgTable, serial, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./tenancy";

export const entitlementPlans = ["basico", "medio", "pro"] as const;
export const entitlementStatuses = ["pending", "trialing", "active", "past_due", "cancelled", "blocked"] as const;
export const entitlementSources = ["system", "manual", "checkout", "webhook"] as const;

export const userEntitlementsTable = pgTable(
  "user_entitlements",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    plan: text("plan"),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("system"),
    provider: text("provider"),
    externalCustomerId: text("external_customer_id"),
    externalOrderId: text("external_order_id"),
    externalRefId: text("external_ref_id"),
    externalSubscriptionId: text("external_subscription_id"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("user_entitlements_user_unique").on(table.userId)],
);

export const insertUserEntitlementSchema = createInsertSchema(userEntitlementsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EntitlementPlan = (typeof entitlementPlans)[number];
export type EntitlementStatus = (typeof entitlementStatuses)[number];
export type UserEntitlement = typeof userEntitlementsTable.$inferSelect;
export type InsertUserEntitlement = z.infer<typeof insertUserEntitlementSchema>;

export function canUseFeature(plan: string | null | undefined, feature: "delivery" | "fiscal"): boolean {
  if (feature === "delivery") return plan === "medio" || plan === "pro";
  if (feature === "fiscal") return plan === "pro";
  return false;
}
