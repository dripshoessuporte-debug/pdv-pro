import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const storeSettingsTable = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  storeName: text("store_name").notNull().default("Meu Restaurante"),
  storePhone: text("store_phone"),
  storeCep: text("store_cep"),
  storeAddress: text("store_address"),
  storeNeighborhood: text("store_neighborhood"),
  storeCity: text("store_city"),
  deliveryDispatchTimeMinutes: integer("delivery_dispatch_time_minutes").notNull().default(20),
  maxOrdersPerRoute: integer("max_orders_per_route").notNull().default(4),
  deliveryFeeMode: text("delivery_fee_mode").notNull().default("manual"),
  deliveryPricePerKm: numeric("delivery_price_per_km", { precision: 10, scale: 2 }),
  minimumDeliveryFee: numeric("minimum_delivery_fee", { precision: 10, scale: 2 }),
  maximumDeliveryFee: numeric("maximum_delivery_fee", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StoreSettings = typeof storeSettingsTable.$inferSelect;
