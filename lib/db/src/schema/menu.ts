import { pgTable, serial, text, integer, numeric, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
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

export const variantTemplatesTable = pgTable(
  "variant_templates",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().default(1).references(() => storesTable.id),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("variant_templates_store_id_idx").on(table.storeId),
  ]
);

export const variantTemplateOptionsTable = pgTable(
  "variant_template_options",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").notNull().references(() => variantTemplatesTable.id),
    name: text("name").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    available: boolean("available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("variant_template_options_template_id_idx").on(table.templateId),
  ]
);


export const addonGroupsTable = pgTable(
  "addon_groups",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    name: text("name").notNull(),
    description: text("description"),
    required: boolean("required").notNull().default(false),
    minSelected: integer("min_selected").notNull().default(0),
    maxSelected: integer("max_selected"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("addon_groups_store_id_idx").on(table.storeId),
  ]
);

export const addonOptionsTable = pgTable(
  "addon_options",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    groupId: integer("group_id").notNull().references(() => addonGroupsTable.id),
    name: text("name").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    available: boolean("available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("addon_options_store_id_idx").on(table.storeId),
    index("addon_options_group_id_idx").on(table.groupId),
  ]
);

export const productAddonGroupsTable = pgTable(
  "product_addon_groups",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    productId: integer("product_id").notNull().references(() => productsTable.id),
    addonGroupId: integer("addon_group_id").notNull().references(() => addonGroupsTable.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("product_addon_groups_store_id_idx").on(table.storeId),
    index("product_addon_groups_product_id_idx").on(table.productId),
    uniqueIndex("product_addon_groups_unique_idx").on(table.storeId, table.productId, table.addonGroupId),
  ]
);


export const pizzaSizesTable = pgTable(
  "pizza_sizes",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    name: text("name").notNull(),
    maxFlavors: integer("max_flavors").notNull().default(1),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pizza_sizes_store_id_idx").on(table.storeId)],
);

export const pizzaPriceTiersTable = pgTable(
  "pizza_price_tiers",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pizza_price_tiers_store_id_idx").on(table.storeId)],
);

export const pizzaSizeTierPricesTable = pgTable(
  "pizza_size_tier_prices",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    sizeId: integer("size_id").notNull().references(() => pizzaSizesTable.id),
    tierId: integer("tier_id").notNull().references(() => pizzaPriceTiersTable.id),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pizza_size_tier_prices_store_id_idx").on(table.storeId),
    uniqueIndex("pizza_size_tier_prices_unique_idx").on(table.storeId, table.sizeId, table.tierId),
  ],
);

export const pizzaFlavorsTable = pgTable(
  "pizza_flavors",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    productId: integer("product_id").notNull().references(() => productsTable.id),
    tierId: integer("tier_id").notNull().references(() => pizzaPriceTiersTable.id),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pizza_flavors_store_id_idx").on(table.storeId),
    uniqueIndex("pizza_flavors_store_product_unique_idx").on(table.storeId, table.productId),
  ],
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

export const insertVariantTemplateSchema = createInsertSchema(variantTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVariantTemplate = z.infer<typeof insertVariantTemplateSchema>;
export type VariantTemplate = typeof variantTemplatesTable.$inferSelect;

export const insertVariantTemplateOptionSchema = createInsertSchema(variantTemplateOptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVariantTemplateOption = z.infer<typeof insertVariantTemplateOptionSchema>;
export type VariantTemplateOption = typeof variantTemplateOptionsTable.$inferSelect;


export const insertAddonGroupSchema = createInsertSchema(addonGroupsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAddonGroup = z.infer<typeof insertAddonGroupSchema>;
export type AddonGroup = typeof addonGroupsTable.$inferSelect;

export const insertAddonOptionSchema = createInsertSchema(addonOptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAddonOption = z.infer<typeof insertAddonOptionSchema>;
export type AddonOption = typeof addonOptionsTable.$inferSelect;

export const insertProductAddonGroupSchema = createInsertSchema(productAddonGroupsTable).omit({ id: true });
export type InsertProductAddonGroup = z.infer<typeof insertProductAddonGroupSchema>;
export type ProductAddonGroup = typeof productAddonGroupsTable.$inferSelect;

export type PizzaSize = typeof pizzaSizesTable.$inferSelect;
export type PizzaPriceTier = typeof pizzaPriceTiersTable.$inferSelect;
export type PizzaSizeTierPrice = typeof pizzaSizeTierPricesTable.$inferSelect;
export type PizzaFlavor = typeof pizzaFlavorsTable.$inferSelect;
