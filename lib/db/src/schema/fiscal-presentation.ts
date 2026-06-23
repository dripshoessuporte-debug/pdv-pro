import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { storesTable } from "./tenancy";

export const storeFiscalPresentationTable = pgTable(
  "store_fiscal_presentation",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    mode: text("mode").notNull().default("simplified"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("store_fiscal_presentation_store_unique").on(table.storeId),
  ],
);
