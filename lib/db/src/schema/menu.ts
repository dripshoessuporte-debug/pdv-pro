import { pgTable, serial, text, integer, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./tenancy";

export const categoriesTable = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().default(1).references(() => storesTable.id),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("categories_store_id_idx").on(table.storeId),
  ]
);

export const productsTable = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().default(1).references(() => storesTable.id),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    available: boolean("available").notNull().default(true),
    active: boolean("active").notNull().default(true),
    categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("products_store_id_idx").on(table.storeId),
  ]
);

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
