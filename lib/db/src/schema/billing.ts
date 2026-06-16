import { pgTable, serial, text, timestamp, integer, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./tenancy";

export const billingProviderProductsTable = pgTable("billing_provider_products", {
  id: serial("id").primaryKey(), provider: text("provider").notNull().default("cakto"), externalProductId: text("external_product_id"), externalProductShortId: text("external_product_short_id"), externalOfferId: text("external_offer_id"), productName: text("product_name"), offerName: text("offer_name"), plan: text("plan").notNull(), checkoutUrl: text("checkout_url"), active: boolean("active").notNull().default(true), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const billingWebhookEventsTable = pgTable("billing_webhook_events", {
  id: serial("id").primaryKey(), provider: text("provider").notNull().default("cakto"), externalEventId: text("external_event_id"), externalOrderId: text("external_order_id"), externalRefId: text("external_ref_id"), externalSubscriptionId: text("external_subscription_id"), eventType: text("event_type"), paymentStatus: text("payment_status"), processingStatus: text("processing_status").notNull().default("received"), email: text("email"), plan: text("plan"), rawPayload: jsonb("raw_payload").notNull(), processedAt: timestamp("processed_at", { withTimezone: true }), errorMessage: text("error_message"), createdUserId: integer("created_user_id").references(() => usersTable.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const userActivationTokensTable = pgTable("user_activation_tokens", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => usersTable.id), tokenHash: text("token_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), usedAt: timestamp("used_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("user_activation_tokens_token_hash_unique").on(table.tokenHash)]);

export const accessRequestsTable = pgTable("access_requests", {
  id: serial("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull(), phone: text("phone").notNull(), restaurantName: text("restaurant_name").notNull(), requestedPlan: text("requested_plan").notNull(), message: text("message"), status: text("status").notNull().default("pending"), createdUserId: integer("created_user_id").references(() => usersTable.id), reviewedBy: integer("reviewed_by").references(() => usersTable.id), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
