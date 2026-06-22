CREATE TABLE IF NOT EXISTS "store_fiscal_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "setup_status" text NOT NULL DEFAULT 'not_configured',
  "provider" text NOT NULL DEFAULT 'focus_nfe',
  "environment" text NOT NULL DEFAULT 'homologation',
  "emission_mode" text NOT NULL DEFAULT 'manual',
  "legal_name" text,
  "trade_name" text,
  "cnpj" text,
  "state_registration" text,
  "tax_regime" text,
  "crt" text,
  "state" text,
  "city" text,
  "city_ibge_code" text,
  "postal_code" text,
  "street" text,
  "number" text,
  "neighborhood" text,
  "complement" text,
  "series" integer,
  "next_number" integer,
  "nature_operation" text,
  "csc_id" text,
  "csc_secret_reference" text,
  "provider_company_id" text,
  "certificate_reference" text,
  "certificate_status" text,
  "certificate_expires_at" timestamp with time zone,
  "configured_by_user_id" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "store_fiscal_settings_setup_status_check" CHECK ("setup_status" IN ('not_configured', 'configuring', 'homologation', 'production', 'blocked', 'disabled')),
  CONSTRAINT "store_fiscal_settings_environment_check" CHECK ("environment" IN ('homologation', 'production')),
  CONSTRAINT "store_fiscal_settings_emission_mode_check" CHECK ("emission_mode" IN ('manual', 'automatic'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "store_fiscal_settings_store_unique" ON "store_fiscal_settings" ("store_id");

CREATE TABLE IF NOT EXISTS "fiscal_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "name" text NOT NULL,
  "description" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "fiscal_groups_store_id_idx" ON "fiscal_groups" ("store_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_groups_store_name_unique" ON "fiscal_groups" ("store_id", "name");

CREATE TABLE IF NOT EXISTS "fiscal_group_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "fiscal_group_id" integer NOT NULL REFERENCES "fiscal_groups"("id"),
  "ncm" text,
  "cest" text,
  "cfop" text,
  "commercial_unit" text,
  "origin" text,
  "icms_code" text,
  "pis_code" text,
  "cofins_code" text,
  "gtin_mode" text NOT NULL DEFAULT 'product_or_no_gtin',
  "nature_operation" text,
  "tax_data" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "fiscal_group_rules_store_id_idx" ON "fiscal_group_rules" ("store_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_group_rules_group_unique" ON "fiscal_group_rules" ("store_id", "fiscal_group_id");

CREATE TABLE IF NOT EXISTS "product_fiscal_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "fiscal_group_id" integer REFERENCES "fiscal_groups"("id"),
  "ncm" text,
  "cest" text,
  "cfop" text,
  "commercial_unit" text,
  "origin" text,
  "icms_code" text,
  "pis_code" text,
  "cofins_code" text,
  "gtin" text,
  "nature_operation" text,
  "tax_data" jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "product_fiscal_settings_store_id_idx" ON "product_fiscal_settings" ("store_id");
CREATE INDEX IF NOT EXISTS "product_fiscal_settings_group_id_idx" ON "product_fiscal_settings" ("fiscal_group_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_fiscal_settings_store_product_unique" ON "product_fiscal_settings" ("store_id", "product_id");

CREATE TABLE IF NOT EXISTS "fiscal_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "actor_user_id" integer REFERENCES "users"("id"),
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "fiscal_audit_logs_store_id_idx" ON "fiscal_audit_logs" ("store_id");
CREATE INDEX IF NOT EXISTS "fiscal_audit_logs_created_at_idx" ON "fiscal_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "fiscal_audit_logs_target_idx" ON "fiscal_audit_logs" ("target_type", "target_id");
