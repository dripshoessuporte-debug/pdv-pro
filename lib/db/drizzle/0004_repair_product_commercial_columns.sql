ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "barcode" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost_price" numeric(10,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "track_stock" boolean DEFAULT false NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "allow_sale_without_stock" boolean DEFAULT false NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_qty" numeric(10,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_min_qty" numeric(10,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "unit" text DEFAULT 'unidade' NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "preparation_time_minutes" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_url" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_storage_key" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_provider" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_alt" text;

CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "name" text NOT NULL,
  "price" numeric(10,2) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "available" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "available" boolean DEFAULT true NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_store_id_stores_id_fk'
  ) THEN
    ALTER TABLE "product_variants"
      ADD CONSTRAINT "product_variants_store_id_stores_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_product_id_products_id_fk'
  ) THEN
    ALTER TABLE "product_variants"
      ADD CONSTRAINT "product_variants_product_id_products_id_fk"
      FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "product_variants_store_id_idx" ON "product_variants" USING btree ("store_id");
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");
