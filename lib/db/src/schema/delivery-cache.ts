import {
  pgTable,
  serial,
  text,
  numeric,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const deliveryDistanceCacheTable = pgTable(
  "delivery_distance_cache",
  {
    id: serial("id").primaryKey(),
    originCep: text("origin_cep").notNull(),
    destinationCep: text("destination_cep").notNull(),
    distanceKm: numeric("distance_km", { precision: 10, scale: 3 }).notNull(),
    provider: text("provider").notNull(),
    addressHash: text("address_hash").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("ddcache_origin_dest_provider_address").on(
      table.originCep,
      table.destinationCep,
      table.provider,
      table.addressHash,
    ),
  ],
);

export type DeliveryDistanceCache =
  typeof deliveryDistanceCacheTable.$inferSelect;
