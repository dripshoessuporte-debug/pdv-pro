import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { storesTable } from "./tenancy";

export const deliveryRoutesTable = pgTable(
  "delivery_routes",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .default(1)
      .references(() => storesTable.id),
    name: text("name").notNull(),
    mainNeighborhood: text("main_neighborhood").notNull(),
    includedNeighborhoods: text("included_neighborhoods")
      .notNull()
      .default("[]"), // JSON array as text
    status: text("status").notNull().default("available"), // available | in_progress | completed
    color: text("color").notNull().default("#3b82f6"),
    courierId: integer("courier_id"),
    courierName: text("courier_name"),
    storeOrigin: text("store_origin").notNull(),
    mapsUrl: text("maps_url"),
    dispatchDeadline: timestamp("dispatch_deadline", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("delivery_routes_store_id_idx").on(table.storeId),
    index("delivery_routes_courier_id_idx").on(table.courierId),
  ],
);

export const deliveryRouteOrdersTable = pgTable("delivery_route_orders", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id")
    .notNull()
    .references(() => deliveryRoutesTable.id),
  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id),
  stopOrder: integer("stop_order").notNull().default(0),
});
