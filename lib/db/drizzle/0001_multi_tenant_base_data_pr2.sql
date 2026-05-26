ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "store_id" integer;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "store_id" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "store_id" integer;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "store_id" integer;
--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "store_id" integer;
--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN IF NOT EXISTS "store_id" integer;
--> statement-breakpoint
DO $$
DECLARE
  default_store_id integer;
BEGIN
  SELECT id INTO default_store_id FROM "stores" WHERE "slug" = 'default-store' LIMIT 1;

  IF default_store_id IS NULL THEN
    INSERT INTO "stores" ("name", "slug", "status")
    VALUES ('Loja Padrão', 'default-store', 'active')
    ON CONFLICT ("slug") DO NOTHING;

    SELECT id INTO default_store_id FROM "stores" WHERE "slug" = 'default-store' LIMIT 1;
  END IF;

  UPDATE "store_settings" SET "store_id" = default_store_id WHERE "store_id" IS NULL;
  UPDATE "categories" SET "store_id" = default_store_id WHERE "store_id" IS NULL;
  UPDATE "products" SET "store_id" = default_store_id WHERE "store_id" IS NULL;
  UPDATE "customers" SET "store_id" = default_store_id WHERE "store_id" IS NULL;
  UPDATE "tables" SET "store_id" = default_store_id WHERE "store_id" IS NULL;
  UPDATE "couriers" SET "store_id" = default_store_id WHERE "store_id" IS NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "store_settings" ALTER COLUMN "store_id" SET DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "store_id" SET DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "store_id" SET DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "store_id" SET DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "tables" ALTER COLUMN "store_id" SET DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "couriers" ALTER COLUMN "store_id" SET DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "store_settings" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tables" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "couriers" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tables" ADD CONSTRAINT "tables_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "couriers" ADD CONSTRAINT "couriers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "tables_number_unique";
--> statement-breakpoint
ALTER TABLE "tables" DROP CONSTRAINT IF EXISTS "tables_number_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_settings_store_id_unique" ON "store_settings" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_store_id_idx" ON "categories" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_store_id_idx" ON "products" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_store_id_idx" ON "customers" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tables_store_id_idx" ON "tables" USING btree ("store_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tables_store_number_unique" ON "tables" USING btree ("store_id", "number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "couriers_store_id_idx" ON "couriers" USING btree ("store_id");
