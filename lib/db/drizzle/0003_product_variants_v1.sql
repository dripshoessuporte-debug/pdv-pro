CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer DEFAULT 1 NOT NULL,
  "product_id" integer NOT NULL,
  "name" text NOT NULL,
  "price" numeric(10,2) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "available" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "product_variants_store_id_idx" ON "product_variants" USING btree ("store_id");
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");
