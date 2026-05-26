import { pgTable, serial, integer, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { storesTable } from "./tenancy";

export const storeSettingsTable = pgTable(
  "store_settings",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().default(1).references(() => storesTable.id),
    storeName: text("store_name").notNull().default("Minha Loja"),
    storePhone: text("store_phone"),
    storeEmail: text("store_email"),
    storeCep: text("store_cep"),
    storeAddress: text("store_address"),
    storeNumber: text("store_number"),
    storeNeighborhood: text("store_neighborhood"),
    storeCity: text("store_city").notNull().default(""),
    storeState: text("store_state").notNull().default(""),
    storeCountry: text("store_country").notNull().default("Brasil"),
    deliveryDispatchTimeMinutes: integer("delivery_dispatch_time_minutes").notNull().default(20),
    maxOrdersPerRoute: integer("max_orders_per_route").notNull().default(4),
    routeGroupingMode: text("route_grouping_mode").notNull().default("hybrid"),
    deliveryFeeMode: text("delivery_fee_mode").notNull().default("manual"),
    // per_km mode
    deliveryPricePerKm: numeric("delivery_price_per_km", { precision: 10, scale: 2 }),
    // distance_tier mode
    baseDeliveryDistanceKm: numeric("base_delivery_distance_km", { precision: 10, scale: 2 }),
    baseDeliveryFee: numeric("base_delivery_fee", { precision: 10, scale: 2 }),
    additionalPricePerKm: numeric("additional_price_per_km", { precision: 10, scale: 2 }),
    // shared
    minimumDeliveryFee: numeric("minimum_delivery_fee", { precision: 10, scale: 2 }),
    maximumDeliveryFee: numeric("maximum_delivery_fee", { precision: 10, scale: 2 }),
    // distance calculation provider
    distanceProvider: text("distance_provider").notNull().default("approximate_cep"),
    useDistanceCache: text("use_distance_cache").notNull().default("true"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("store_settings_store_id_unique").on(table.storeId),
  ]
);

export type StoreSettings = typeof storeSettingsTable.$inferSelect;
