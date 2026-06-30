CREATE TABLE IF NOT EXISTS "multiflavor_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "category_id" integer REFERENCES "categories"("id"),
  "name" text NOT NULL,
  "description" text,
  "quantity_step_label" text DEFAULT 'Quantidade de sabores' NOT NULL,
  "options_step_label" text DEFAULT 'Sabores' NOT NULL,
  "pricing_mode" text DEFAULT 'highest_classification' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "available" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "multiflavor_groups_pricing_mode_check" CHECK ("pricing_mode" IN ('highest_classification'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "multiflavor_groups_store_id_id_unique_idx" ON "multiflavor_groups" ("store_id", "id");
CREATE INDEX IF NOT EXISTS "multiflavor_groups_store_id_idx" ON "multiflavor_groups" ("store_id");
CREATE INDEX IF NOT EXISTS "multiflavor_groups_category_id_idx" ON "multiflavor_groups" ("category_id");

CREATE TABLE IF NOT EXISTS "multiflavor_sizes" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "group_id" integer NOT NULL,
  "name" text NOT NULL,
  "min_flavors" integer DEFAULT 1 NOT NULL,
  "max_flavors" integer NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "available" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "multiflavor_sizes_group_store_fk" FOREIGN KEY ("store_id", "group_id") REFERENCES "multiflavor_groups"("store_id", "id") ON DELETE CASCADE,
  CONSTRAINT "multiflavor_sizes_min_flavors_check" CHECK ("min_flavors" >= 1),
  CONSTRAINT "multiflavor_sizes_max_flavors_check" CHECK ("max_flavors" >= "min_flavors")
);
CREATE UNIQUE INDEX IF NOT EXISTS "multiflavor_sizes_store_id_id_unique_idx" ON "multiflavor_sizes" ("store_id", "id");
CREATE INDEX IF NOT EXISTS "multiflavor_sizes_store_id_idx" ON "multiflavor_sizes" ("store_id");
CREATE INDEX IF NOT EXISTS "multiflavor_sizes_group_id_idx" ON "multiflavor_sizes" ("group_id");

CREATE TABLE IF NOT EXISTS "multiflavor_classifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "group_id" integer NOT NULL,
  "name" text NOT NULL,
  "rank" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "multiflavor_classifications_group_store_fk" FOREIGN KEY ("store_id", "group_id") REFERENCES "multiflavor_groups"("store_id", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "multiflavor_classifications_store_id_id_unique_idx" ON "multiflavor_classifications" ("store_id", "id");
CREATE INDEX IF NOT EXISTS "multiflavor_classifications_store_id_idx" ON "multiflavor_classifications" ("store_id");
CREATE INDEX IF NOT EXISTS "multiflavor_classifications_group_id_idx" ON "multiflavor_classifications" ("group_id");

CREATE TABLE IF NOT EXISTS "multiflavor_size_classification_prices" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "group_id" integer NOT NULL,
  "size_id" integer NOT NULL,
  "classification_id" integer NOT NULL,
  "price" numeric(10,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "multiflavor_size_classification_prices_group_store_fk" FOREIGN KEY ("store_id", "group_id") REFERENCES "multiflavor_groups"("store_id", "id") ON DELETE CASCADE,
  CONSTRAINT "multiflavor_size_classification_prices_size_store_fk" FOREIGN KEY ("store_id", "size_id") REFERENCES "multiflavor_sizes"("store_id", "id") ON DELETE CASCADE,
  CONSTRAINT "multiflavor_size_classification_prices_classification_store_fk" FOREIGN KEY ("store_id", "classification_id") REFERENCES "multiflavor_classifications"("store_id", "id") ON DELETE CASCADE,
  CONSTRAINT "multiflavor_size_classification_prices_price_check" CHECK ("price" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "multiflavor_size_classification_prices_unique_idx" ON "multiflavor_size_classification_prices" ("store_id", "size_id", "classification_id");
CREATE INDEX IF NOT EXISTS "multiflavor_size_classification_prices_store_id_idx" ON "multiflavor_size_classification_prices" ("store_id");
CREATE INDEX IF NOT EXISTS "multiflavor_size_classification_prices_group_id_idx" ON "multiflavor_size_classification_prices" ("group_id");

CREATE TABLE IF NOT EXISTS "multiflavor_flavors" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "group_id" integer NOT NULL,
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "classification_id" integer NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "available" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "multiflavor_flavors_group_store_fk" FOREIGN KEY ("store_id", "group_id") REFERENCES "multiflavor_groups"("store_id", "id") ON DELETE CASCADE,
  CONSTRAINT "multiflavor_flavors_classification_store_fk" FOREIGN KEY ("store_id", "classification_id") REFERENCES "multiflavor_classifications"("store_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "multiflavor_flavors_unique_idx" ON "multiflavor_flavors" ("store_id", "group_id", "product_id");
CREATE INDEX IF NOT EXISTS "multiflavor_flavors_store_id_idx" ON "multiflavor_flavors" ("store_id");
CREATE INDEX IF NOT EXISTS "multiflavor_flavors_group_id_idx" ON "multiflavor_flavors" ("group_id");
CREATE INDEX IF NOT EXISTS "multiflavor_flavors_product_id_idx" ON "multiflavor_flavors" ("product_id");

CREATE TABLE IF NOT EXISTS "multiflavor_group_addon_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "group_id" integer NOT NULL,
  "addon_group_id" integer NOT NULL REFERENCES "addon_groups"("id"),
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "multiflavor_group_addon_groups_group_store_fk" FOREIGN KEY ("store_id", "group_id") REFERENCES "multiflavor_groups"("store_id", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "multiflavor_group_addon_groups_unique_idx" ON "multiflavor_group_addon_groups" ("store_id", "group_id", "addon_group_id");
CREATE INDEX IF NOT EXISTS "multiflavor_group_addon_groups_store_id_idx" ON "multiflavor_group_addon_groups" ("store_id");
CREATE INDEX IF NOT EXISTS "multiflavor_group_addon_groups_group_id_idx" ON "multiflavor_group_addon_groups" ("group_id");
