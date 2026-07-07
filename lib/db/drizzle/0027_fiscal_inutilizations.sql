CREATE TABLE IF NOT EXISTS "fiscal_inutilizations" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "provider" text NOT NULL DEFAULT 'focus_nfe',
  "environment" text NOT NULL,
  "series" integer NOT NULL,
  "number_start" integer NOT NULL,
  "number_end" integer NOT NULL,
  "justification" text NOT NULL,
  "status" text NOT NULL DEFAULT 'submitting',
  "provider_status" text,
  "protocol" text,
  "rejection_code" text,
  "rejection_message" text,
  "created_by_user_id" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fiscal_inutilizations_provider_check" CHECK ("provider" IN ('focus_nfe')),
  CONSTRAINT "fiscal_inutilizations_environment_check" CHECK ("environment" IN ('homologation', 'production')),
  CONSTRAINT "fiscal_inutilizations_status_check" CHECK ("status" IN ('submitting','authorized','rejected','error')),
  CONSTRAINT "fiscal_inutilizations_range_check" CHECK ("number_end" >= "number_start")
);
CREATE INDEX IF NOT EXISTS "fiscal_inutilizations_store_env_series_idx" ON "fiscal_inutilizations" ("store_id", "environment", "series");
