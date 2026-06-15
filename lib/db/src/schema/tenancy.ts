import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storesTable = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const entitlementPlans = ["basico", "medio", "pro"] as const;
export const entitlementStatuses = [
  "pending",
  "trialing",
  "active",
  "cancelled",
  "blocked",
] as const;
export const entitlementSources = ["system", "manual", "checkout", "webhook"] as const;

export const userEntitlementsTable = pgTable(
  "user_entitlements",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    plan: text("plan"),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("system"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("user_entitlements_user_unique").on(table.userId)],
);

export const storeMembersTable = pgTable(
  "store_members",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    role: text("role").notNull().default("owner"),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("store_members_store_user_unique").on(
      table.storeId,
      table.userId,
    ),
  ],
);

export const platformAdminRoles = [
  "platform_owner",
  "platform_admin",
  "platform_support",
  "platform_finance",
] as const;

export const platformAdminsTable = pgTable(
  "platform_admins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("platform_admins_user_unique").on(table.userId)],
);

export const insertStoreSchema = createInsertSchema(storesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertStoreMemberSchema = createInsertSchema(
  storeMembersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStoreMember = z.infer<typeof insertStoreMemberSchema>;
export type StoreMember = typeof storeMembersTable.$inferSelect;

export const insertPlatformAdminSchema = createInsertSchema(
  platformAdminsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type PlatformAdminRole = (typeof platformAdminRoles)[number];
export type InsertPlatformAdmin = z.infer<typeof insertPlatformAdminSchema>;
export type PlatformAdmin = typeof platformAdminsTable.$inferSelect;

export const insertUserEntitlementSchema = createInsertSchema(
  userEntitlementsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type EntitlementPlan = (typeof entitlementPlans)[number];
export type EntitlementStatus = (typeof entitlementStatuses)[number];
export type EntitlementSource = (typeof entitlementSources)[number];
export type InsertUserEntitlement = z.infer<typeof insertUserEntitlementSchema>;
export type UserEntitlement = typeof userEntitlementsTable.$inferSelect;
