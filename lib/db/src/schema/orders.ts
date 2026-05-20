import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { tablesTable } from "./tables";
import { productsTable } from "./menu";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => tablesTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  status: text("status").notNull().default("open"),
  type: text("type").notNull().default("counter"),
  notes: text("notes"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  // Delivery / takeaway fields
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  deliveryCep: text("delivery_cep"),
  deliveryAddress: text("delivery_address"),
  deliveryNeighborhood: text("delivery_neighborhood"),
  deliveryReference: text("delivery_reference"),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  deliveryNotes: text("delivery_notes"),
  deliveryStatus: text("delivery_status"), // null for non-delivery orders
  // Payment on delivery fields
  paymentTiming: text("payment_timing").notNull().default("now"), // now | on_delivery
  deliveryPaymentMethod: text("delivery_payment_method"), // dinheiro | pix | cartao
  needsChange: text("needs_change"), // "true" | "false" (stored as text for simplicity)
  changeFor: numeric("change_for", { precision: 10, scale: 2 }),
  deliveryPaymentNotes: text("delivery_payment_notes"),
  kitchenAcceptedAt: timestamp("kitchen_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
