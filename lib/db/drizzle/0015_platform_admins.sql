CREATE TABLE IF NOT EXISTS "platform_admins" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "role" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_user_unique" ON "platform_admins" USING btree ("user_id");
--> statement-breakpoint
DO $$
DECLARE
  owner_user_id integer;
BEGIN
  INSERT INTO "users" ("name", "email", "password_hash", "status")
  VALUES (
    'Dono Gestor Max',
    'dono@gestormax.local',
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

  SELECT "id" INTO owner_user_id FROM "users" WHERE "email" = 'dono@gestormax.local' LIMIT 1;

  INSERT INTO "platform_admins" ("user_id", "role", "status")
  VALUES (owner_user_id, 'platform_owner', 'active')
  ON CONFLICT ("user_id") DO UPDATE SET
    "role" = 'platform_owner',
    "status" = 'active',
    "updated_at" = now();
END $$;
