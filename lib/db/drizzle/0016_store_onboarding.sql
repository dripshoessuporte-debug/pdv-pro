ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean NOT NULL DEFAULT false;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "onboarding_step" text;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "uses_delivery" boolean NOT NULL DEFAULT true;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "accepts_cash" boolean NOT NULL DEFAULT true;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "accepts_card" boolean NOT NULL DEFAULT true;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "accepts_pix" boolean NOT NULL DEFAULT true;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "accepts_online_payment" boolean NOT NULL DEFAULT false;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "uses_tables" boolean NOT NULL DEFAULT false;
