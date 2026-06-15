CREATE TABLE IF NOT EXISTS "user_entitlements" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "plan" text,
  "status" text NOT NULL DEFAULT 'pending',
  "source" text NOT NULL DEFAULT 'system',
  "trial_ends_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_entitlements_user_unique" UNIQUE ("user_id"),
  CONSTRAINT "user_entitlements_plan_check" CHECK ("plan" IS NULL OR "plan" IN ('basico', 'medio', 'pro')),
  CONSTRAINT "user_entitlements_status_check" CHECK ("status" IN ('pending', 'trialing', 'active', 'cancelled', 'blocked')),
  CONSTRAINT "user_entitlements_source_check" CHECK ("source" IN ('system', 'manual', 'checkout', 'webhook'))
);

CREATE INDEX IF NOT EXISTS "user_entitlements_status_idx" ON "user_entitlements" ("status");
