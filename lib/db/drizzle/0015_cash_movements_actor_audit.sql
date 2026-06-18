ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "actor_user_id" integer;
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "actor_name" text;
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "actor_role" text;

DO $$ BEGIN
 ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
