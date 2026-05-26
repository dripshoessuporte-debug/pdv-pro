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
    sku: text("sku"),
    barcode: text("barcode"),
    costPrice: numeric("cost_price", { precision: 10, scale: 2 }),
    trackStock: boolean("track_stock").notNull().default(false),
    allowSaleWithoutStock: boolean("allow_sale_without_stock").notNull().default(false),
    stockQty: numeric("stock_qty", { precision: 10, scale: 2 }),
    stockMinQty: numeric("stock_min_qty", { precision: 10, scale: 2 }),
    unit: text("unit").notNull().default("unidade"),
    preparationTimeMinutes: integer("preparation_time_minutes"),
    imageUrl: text("image_url"),
    imageStorageKey: text("image_storage_key"),
    imageProvider: text("image_provider"),
    imageAlt: text("image_alt"),
    available: boolean("available").notNull().default(true),
    active: boolean("active").notNull().default(true),
    categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("products_store_id_idx").on(table.storeId),
  ]
);

export const productVariantsTable = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().default(1).references(() => storesTable.id),
    productId: integer("product_id").notNull().references(() => productsTable.id),
    name: text("name").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    active: boolean("active").notNull().default(true),
    available: boolean("available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("product_variants_store_id_idx").on(table.storeId),
    index("product_variants_product_id_idx").on(table.productId),
  ]
);

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

export const insertProductVariantSchema = createInsertSchema(productVariantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariantsTable.$inferSelect;
