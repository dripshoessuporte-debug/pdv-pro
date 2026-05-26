import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./tenancy";

export const customersTable = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().default(1).references(() => storesTable.id),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customers_store_id_idx").on(table.storeId),
  ]
);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
