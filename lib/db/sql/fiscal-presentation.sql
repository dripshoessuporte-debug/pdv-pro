CREATE TABLE IF NOT EXISTS "store_fiscal_presentation" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "mode" text NOT NULL DEFAULT 'simplified',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "store_fiscal_presentation_mode_check" CHECK ("mode" IN ('simplified', 'complete'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "store_fiscal_presentation_store_unique" ON "store_fiscal_presentation" ("store_id");

CREATE TABLE IF NOT EXISTS "fiscal_group_presentation" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "fiscal_group_id" integer NOT NULL REFERENCES "fiscal_groups"("id"),
  "document_description" text,
  "allow_aggregation" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "fiscal_group_presentation_store_idx" ON "fiscal_group_presentation" ("store_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_group_presentation_group_unique" ON "fiscal_group_presentation" ("store_id", "fiscal_group_id");
