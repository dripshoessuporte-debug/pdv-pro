CREATE TABLE IF NOT EXISTS "store_fiscal_presentation" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "mode" text NOT NULL DEFAULT 'simplified',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "store_fiscal_presentation_mode_check" CHECK ("mode" IN ('simplified', 'complete'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "store_fiscal_presentation_store_unique" ON "store_fiscal_presentation" ("store_id");
