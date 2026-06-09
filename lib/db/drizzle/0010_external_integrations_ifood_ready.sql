CREATE TABLE IF NOT EXISTS "external_store_integrations" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "source" text NOT NULL,
  "external_merchant_id" text NOT NULL,
  "external_merchant_name" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "external_store_integrations_store_id_idx"
  ON "external_store_integrations" ("store_id");

CREATE UNIQUE INDEX IF NOT EXISTS "external_store_integrations_source_merchant_unique"
  ON "external_store_integrations" ("source", "external_merchant_id");

CREATE TABLE IF NOT EXISTS "external_order_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "source" text NOT NULL,
  "external_event_id" text,
  "external_order_id" text,
  "external_merchant_id" text,
  "store_id" integer REFERENCES "stores"("id"),
  "event_type" text DEFAULT 'order.created' NOT NULL,
  "raw_payload" text NOT NULL,
  "processing_status" text DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "external_order_events_store_id_idx"
  ON "external_order_events" ("store_id");

CREATE INDEX IF NOT EXISTS "external_order_events_lookup_idx"
  ON "external_order_events" ("source", "external_merchant_id", "external_order_id");

CREATE UNIQUE INDEX IF NOT EXISTS "orders_store_source_external_unique"
  ON "orders" ("store_id", "source", "external_order_id")
  WHERE "source" IS NOT NULL AND "external_order_id" IS NOT NULL;

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "external_payment_id" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;
