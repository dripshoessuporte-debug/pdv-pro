import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./tenancy";

export const externalStoreIntegrationsTable = pgTable(
  "external_store_integrations",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    source: text("source").notNull(),
    externalMerchantId: text("external_merchant_id").notNull(),
    externalMerchantName: text("external_merchant_name"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("external_store_integrations_store_id_idx").on(table.storeId),
    uniqueIndex("external_store_integrations_source_merchant_unique").on(
      table.source,
      table.externalMerchantId,
    ),
  ],
);

export const externalOrderEventsTable = pgTable(
  "external_order_events",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    externalEventId: text("external_event_id"),
    externalOrderId: text("external_order_id"),
    externalMerchantId: text("external_merchant_id"),
    storeId: integer("store_id").references(() => storesTable.id),
    eventType: text("event_type").notNull().default("order.created"),
    rawPayload: text("raw_payload").notNull(),
    processingStatus: text("processing_status").notNull().default("pending"),
    errorMessage: text("error_message"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("external_order_events_store_id_idx").on(table.storeId),
    index("external_order_events_lookup_idx").on(
      table.source,
      table.externalMerchantId,
      table.externalOrderId,
    ),
  ],
);

export const insertExternalStoreIntegrationSchema = createInsertSchema(
  externalStoreIntegrationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExternalStoreIntegration = z.infer<
  typeof insertExternalStoreIntegrationSchema
>;
export type ExternalStoreIntegration =
  typeof externalStoreIntegrationsTable.$inferSelect;

export const insertExternalOrderEventSchema = createInsertSchema(
  externalOrderEventsTable,
).omit({ id: true, receivedAt: true });
export type InsertExternalOrderEvent = z.infer<
  typeof insertExternalOrderEventSchema
>;
export type ExternalOrderEvent = typeof externalOrderEventsTable.$inferSelect;
