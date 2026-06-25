CREATE TABLE IF NOT EXISTS "fiscal_provider_credentials" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "provider" text NOT NULL DEFAULT 'focus_nfe',
  "environment" text NOT NULL,
  "credential_type" text NOT NULL DEFAULT 'api_token',
  "encrypted_value" text NOT NULL,
  "initialization_vector" text NOT NULL,
  "authentication_tag" text NOT NULL,
  "key_version" text NOT NULL DEFAULT 'v1',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fiscal_provider_credentials_provider_check" CHECK ("provider" IN ('focus_nfe')),
  CONSTRAINT "fiscal_provider_credentials_environment_check" CHECK ("environment" IN ('homologation', 'production')),
  CONSTRAINT "fiscal_provider_credentials_type_check" CHECK ("credential_type" IN ('api_token'))
);
CREATE INDEX IF NOT EXISTS "fiscal_provider_credentials_store_id_idx" ON "fiscal_provider_credentials" ("store_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_provider_credentials_unique" ON "fiscal_provider_credentials" ("store_id", "provider", "environment", "credential_type");
