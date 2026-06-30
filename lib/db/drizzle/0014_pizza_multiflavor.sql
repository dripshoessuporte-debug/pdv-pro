CREATE TABLE IF NOT EXISTS "pizza_sizes" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "name" text NOT NULL,
  "max_flavors" integer NOT NULL DEFAULT 1 CHECK ("max_flavors" >= 1),
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pizza_sizes_store_id_idx" ON "pizza_sizes" ("store_id");
CREATE TABLE IF NOT EXISTS "pizza_price_tiers" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "name" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pizza_price_tiers_store_id_idx" ON "pizza_price_tiers" ("store_id");
CREATE TABLE IF NOT EXISTS "pizza_size_tier_prices" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "size_id" integer NOT NULL REFERENCES "pizza_sizes"("id") ON DELETE CASCADE,
  "tier_id" integer NOT NULL REFERENCES "pizza_price_tiers"("id") ON DELETE CASCADE,
  "price" numeric(10,2) NOT NULL CHECK ("price" >= 0),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "pizza_size_tier_prices_unique_idx" ON "pizza_size_tier_prices" ("store_id", "size_id", "tier_id");
CREATE INDEX IF NOT EXISTS "pizza_size_tier_prices_store_id_idx" ON "pizza_size_tier_prices" ("store_id");
CREATE TABLE IF NOT EXISTS "pizza_flavors" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "tier_id" integer NOT NULL REFERENCES "pizza_price_tiers"("id"),
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "pizza_flavors_store_product_unique_idx" ON "pizza_flavors" ("store_id", "product_id");
CREATE INDEX IF NOT EXISTS "pizza_flavors_store_id_idx" ON "pizza_flavors" ("store_id");
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "item_type" text NOT NULL DEFAULT 'normal';
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "display_name" text;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "pizza_size_id" integer REFERENCES "pizza_sizes"("id");
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "pizza_size_name" text;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "pricing_mode" text;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "base_pizza_tier_id" integer REFERENCES "pizza_price_tiers"("id");
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "base_pizza_tier_name" text;
CREATE TABLE IF NOT EXISTS "order_item_flavors" (
  "id" serial PRIMARY KEY,
  "order_item_id" integer NOT NULL REFERENCES "order_items"("id") ON DELETE CASCADE,
  "product_id" integer REFERENCES "products"("id"),
  "product_name_snapshot" text NOT NULL,
  "tier_id" integer REFERENCES "pizza_price_tiers"("id"),
  "tier_name_snapshot" text NOT NULL,
  "fraction_numerator" integer NOT NULL DEFAULT 1,
  "fraction_denominator" integer NOT NULL DEFAULT 1,
  "sort_order" integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "order_item_flavors_order_item_id_idx" ON "order_item_flavors" ("order_item_id");
