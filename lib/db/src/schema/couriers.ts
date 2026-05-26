import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { storesTable } from "./tenancy";

export const couriersTable = pgTable(
  "couriers",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().default(1).references(() => storesTable.id),
    name: text("name").notNull(),
    phone: text("phone"),
    vehicle: text("vehicle").notNull().default("moto"),
    active: text("active").notNull().default("true"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (row) => [
    index("couriers_store_id_idx").on(row.storeId),
  ]
);
