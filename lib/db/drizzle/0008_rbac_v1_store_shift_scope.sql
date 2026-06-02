ALTER TABLE "store_members" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
UPDATE "store_members" SET "role" = 'max_control' WHERE "role" IN ('owner', 'admin');
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "store_members" ADD CONSTRAINT "store_members_role_check" CHECK ("role" IN ('max_control', 'atendente', 'cozinha', 'motoboy'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "store_id" integer;
--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "operator_user_id" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "store_id" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cash_register_id" integer;
--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD COLUMN IF NOT EXISTS "store_id" integer;
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

  UPDATE "cash_registers" SET "store_id" = default_store_id WHERE "store_id" IS NULL;
  UPDATE "orders" SET "store_id" = default_store_id WHERE "store_id" IS NULL;
  UPDATE "delivery_routes" SET "store_id" = default_store_id WHERE "store_id" IS NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "cash_registers" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "delivery_routes" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_cash_register_id_cash_registers_id_fk" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_registers_store_id_idx" ON "cash_registers" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_registers_operator_user_id_idx" ON "cash_registers" USING btree ("operator_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_store_id_idx" ON "orders" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_cash_register_id_idx" ON "orders" USING btree ("cash_register_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_routes_store_id_idx" ON "delivery_routes" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_routes_courier_id_idx" ON "delivery_routes" USING btree ("courier_id");
