CREATE TABLE IF NOT EXISTS "user_entitlements" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "plan" text,
  "status" text NOT NULL DEFAULT 'pending',
  "source" text NOT NULL DEFAULT 'system',
  "trial_ends_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "user_entitlements_plan_check" CHECK ("plan" IN ('basico', 'medio', 'pro') OR "plan" IS NULL),
  CONSTRAINT "user_entitlements_status_check" CHECK ("status" IN ('pending', 'trialing', 'active', 'cancelled', 'blocked')),
  CONSTRAINT "user_entitlements_source_check" CHECK ("source" IN ('manual', 'checkout', 'webhook', 'system'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_entitlements_user_unique" ON "user_entitlements" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "user_entitlements_status_idx" ON "user_entitlements" USING btree ("status");
CREATE INDEX IF NOT EXISTS "user_entitlements_plan_idx" ON "user_entitlements" USING btree ("plan");
