import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./tenancy";

export const tablesTable = pgTable(
  "tables",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().default(1).references(() => storesTable.id),
    number: integer("number").notNull(),
    capacity: integer("capacity").notNull(),
    status: text("status").notNull().default("available"),
    currentOrderId: integer("current_order_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (row) => [
    index("tables_store_id_idx").on(row.storeId),
    uniqueIndex("tables_store_number_unique").on(row.storeId, row.number),
  ]
);

export const insertTableSchema = createInsertSchema(tablesTable).omit({ id: true, createdAt: true });
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tablesTable.$inferSelect;
