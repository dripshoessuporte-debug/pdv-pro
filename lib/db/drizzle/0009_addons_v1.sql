CREATE TABLE IF NOT EXISTS "addon_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL DEFAULT 1 REFERENCES "stores"("id"),
  "name" text NOT NULL,
  "description" text,
  "required" boolean NOT NULL DEFAULT false,
  "min_selected" integer NOT NULL DEFAULT 0,
  "max_selected" integer,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "addon_groups_store_id_idx" ON "addon_groups" ("store_id");

CREATE TABLE IF NOT EXISTS "addon_options" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL DEFAULT 1 REFERENCES "stores"("id"),
  "group_id" integer NOT NULL REFERENCES "addon_groups"("id"),
  "name" text NOT NULL,
  "price" numeric(10,2) NOT NULL DEFAULT '0',
  "available" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "addon_options_store_id_idx" ON "addon_options" ("store_id");
CREATE INDEX IF NOT EXISTS "addon_options_group_id_idx" ON "addon_options" ("group_id");

CREATE TABLE IF NOT EXISTS "product_addon_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL DEFAULT 1 REFERENCES "stores"("id"),
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "addon_group_id" integer NOT NULL REFERENCES "addon_groups"("id"),
  "sort_order" integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "product_addon_groups_store_id_idx" ON "product_addon_groups" ("store_id");
CREATE INDEX IF NOT EXISTS "product_addon_groups_product_id_idx" ON "product_addon_groups" ("product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_addon_groups_unique_idx" ON "product_addon_groups" ("store_id", "product_id", "addon_group_id");

CREATE TABLE IF NOT EXISTS "order_item_addons" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_item_id" integer NOT NULL REFERENCES "order_items"("id"),
  "addon_option_id" integer REFERENCES "addon_options"("id"),
  "addon_group_name" text NOT NULL,
  "addon_name" text NOT NULL,
  "addon_price" numeric(10,2) NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "total_price" numeric(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS "order_item_addons_order_item_id_idx" ON "order_item_addons" ("order_item_id");
CREATE INDEX IF NOT EXISTS "order_item_addons_addon_option_id_idx" ON "order_item_addons" ("addon_option_id");
