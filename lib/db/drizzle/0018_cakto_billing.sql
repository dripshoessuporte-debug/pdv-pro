ALTER TABLE "user_entitlements" ADD COLUMN IF NOT EXISTS "provider" text;
ALTER TABLE "user_entitlements" ADD COLUMN IF NOT EXISTS "external_customer_id" text;
ALTER TABLE "user_entitlements" ADD COLUMN IF NOT EXISTS "external_order_id" text;
ALTER TABLE "user_entitlements" ADD COLUMN IF NOT EXISTS "external_ref_id" text;
ALTER TABLE "user_entitlements" ADD COLUMN IF NOT EXISTS "external_subscription_id" text;
ALTER TABLE "user_entitlements" ADD COLUMN IF NOT EXISTS "current_period_start" timestamp with time zone;
ALTER TABLE "user_entitlements" ADD COLUMN IF NOT EXISTS "current_period_end" timestamp with time zone;
ALTER TABLE "user_entitlements" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "billing_provider_products" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" text NOT NULL DEFAULT 'cakto',
  "external_product_id" text,
  "external_product_short_id" text,
  "external_offer_id" text,
  "product_name" text,
  "offer_name" text,
  "plan" text NOT NULL,
  "checkout_url" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "billing_webhook_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" text NOT NULL DEFAULT 'cakto',
  "external_event_id" text,
  "external_order_id" text,
  "external_ref_id" text,
  "external_subscription_id" text,
  "event_type" text,
  "payment_status" text,
  "processing_status" text NOT NULL DEFAULT 'received',
  "email" text,
  "plan" text,
  "raw_payload" jsonb NOT NULL,
  "processed_at" timestamp with time zone,
  "error_message" text,
  "created_user_id" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_activation_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_activation_tokens_token_hash_unique" ON "user_activation_tokens" ("token_hash");

CREATE TABLE IF NOT EXISTS "access_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text NOT NULL,
  "restaurant_name" text NOT NULL,
  "requested_plan" text NOT NULL,
  "message" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_user_id" integer REFERENCES "users"("id"),
  "reviewed_by" integer REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
