ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
--> statement-breakpoint
DO $$
DECLARE
  demo_store_id integer;
  demo_user_id integer;
BEGIN
  INSERT INTO "stores" ("name", "slug", "status")
  VALUES ('Loja Demo', 'loja-demo', 'active')
  ON CONFLICT ("slug") DO UPDATE SET
    "name" = EXCLUDED."name",
    "status" = 'active',
    "updated_at" = now();

  SELECT "id" INTO demo_store_id FROM "stores" WHERE "slug" = 'loja-demo' LIMIT 1;

  INSERT INTO "users" ("name", "email", "password_hash", "status")
  VALUES (
    'Administrador Demo',
    'admin@gestormax.local',
    'scrypt$16384$8$1$K9RaWiNGXelywFnfrh36mQ$ZsEOmn0cuOqbRgjH9Vd0p3B8jQZp5NXohMbjyeQVbKxF0Z4ZbS2ECc31qDyL74_ofoj8G6Llvp5d8Xm_XGJ8eA',
    'active'
  )
  ON CONFLICT ("email") DO UPDATE SET
    "name" = EXCLUDED."name",
    "password_hash" = CASE
      WHEN "users"."password_hash" IS NULL OR "users"."password_hash" = ''
      THEN EXCLUDED."password_hash"
      ELSE "users"."password_hash"
    END,
    "status" = 'active',
    "updated_at" = now();

  SELECT "id" INTO demo_user_id FROM "users" WHERE "email" = 'admin@gestormax.local' LIMIT 1;

  INSERT INTO "store_members" ("store_id", "user_id", "role", "is_default", "active")
  VALUES (demo_store_id, demo_user_id, 'max_control', true, true)
  ON CONFLICT ("store_id", "user_id") DO UPDATE SET
    "role" = 'max_control',
    "is_default" = true,
    "active" = true,
    "updated_at" = now();
END $$;
