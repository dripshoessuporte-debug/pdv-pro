import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { tablesTable } from "./tables";
import { addonOptionsTable, productsTable, productVariantsTable } from "./menu";
import { storesTable } from "./tenancy";

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    cashRegisterId: integer("cash_register_id"),
    tableId: integer("table_id").references(() => tablesTable.id),
    customerId: integer("customer_id").references(() => customersTable.id),
    status: text("status").notNull().default("open"),
    type: text("type").notNull().default("counter"),
    notes: text("notes"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Delivery / takeaway fields
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    deliveryCep: text("delivery_cep"),
    deliveryAddress: text("delivery_address"),
    deliveryNumber: text("delivery_number"),
    deliveryNeighborhood: text("delivery_neighborhood"),
    deliveryCity: text("delivery_city"),
    deliveryState: text("delivery_state"),
    deliveryComplement: text("delivery_complement"),
    deliveryReference: text("delivery_reference"),
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    deliveryNotes: text("delivery_notes"),
    deliveryStatus: text("delivery_status"), // null for non-delivery orders
    // Payment on delivery fields
    paymentTiming: text("payment_timing").notNull().default("now"), // now | on_delivery
    deliveryPaymentMethod: text("delivery_payment_method"), // dinheiro | pix | cartao
    needsChange: text("needs_change"), // "true" | "false" (stored as text for simplicity)
    changeFor: numeric("change_for", { precision: 10, scale: 2 }),
    deliveryPaymentNotes: text("delivery_payment_notes"),
    kitchenAcceptedAt: timestamp("kitchen_accepted_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // External / integration fields
    source: text("source"), // null=manual | ifood | whatsapp | site | totem | garcom | api_externa
    externalOrderId: text("external_order_id"),
    rawPayload: text("raw_payload"), // JSON string for audit
    integrationStatus: text("integration_status"), // received | processing | completed | failed
    estimatedDistanceKm: numeric("estimated_distance_km", {
      precision: 10,
      scale: 2,
    }),
    deliveryFeeCalculated: text("delivery_fee_calculated"), // "true" | "false"
    deliveryFeeSource: text("delivery_fee_source"), // manual | automatic | external_api
    deliveryDistanceSource: text("delivery_distance_source"), // approximate_cep | openrouteservice | external_api
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("orders_store_id_idx").on(table.storeId),
    index("orders_cash_register_id_idx").on(table.cashRegisterId),
    uniqueIndex("orders_store_source_external_unique")
      .on(table.storeId, table.source, table.externalOrderId)
      .where(
        sql`${table.source} IS NOT NULL AND ${table.externalOrderId} IS NOT NULL`,
      ),
  ],
);

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id),
  productId: integer("product_id").references(() => productsTable.id),
  variantId: integer("variant_id").references(() => productVariantsTable.id),
  variantName: text("variant_name"),
  variantPrice: numeric("variant_price", { precision: 10, scale: 2 }),
  externalProductName: text("external_product_name"), // used when productId is null (external orders)
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
});

export const orderItemAddonsTable = pgTable(
  "order_item_addons",
  {
    id: serial("id").primaryKey(),
    orderItemId: integer("order_item_id")
      .notNull()
      .references(() => orderItemsTable.id, { onDelete: "cascade" }),
    addonOptionId: integer("addon_option_id").references(
      () => addonOptionsTable.id,
    ),
    addonGroupName: text("addon_group_name").notNull(),
    addonName: text("addon_name").notNull(),
    addonPrice: numeric("addon_price", { precision: 10, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [
    index("order_item_addons_order_item_id_idx").on(table.orderItemId),
    index("order_item_addons_addon_option_id_idx").on(table.addonOptionId),
  ],
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({
  id: true,
});
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;

export const insertOrderItemAddonSchema = createInsertSchema(
  orderItemAddonsTable,
).omit({ id: true });
export type InsertOrderItemAddon = z.infer<typeof insertOrderItemAddonSchema>;
export type OrderItemAddon = typeof orderItemAddonsTable.$inferSelect;
