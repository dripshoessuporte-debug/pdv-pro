import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

export const deliveryRoutesTable = pgTable("delivery_routes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  mainNeighborhood: text("main_neighborhood").notNull(),
  includedNeighborhoods: text("included_neighborhoods").notNull().default("[]"), // JSON array as text
  status: text("status").notNull().default("available"), // available | in_progress | completed
  color: text("color").notNull().default("#3b82f6"),
  courierId: integer("courier_id"),
  courierName: text("courier_name"),
  storeOrigin: text("store_origin").notNull(),
  mapsUrl: text("maps_url"),
  dispatchDeadline: timestamp("dispatch_deadline", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryRouteOrdersTable = pgTable("delivery_route_orders", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").notNull().references(() => deliveryRoutesTable.id),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  stopOrder: integer("stop_order").notNull().default(0),
});
