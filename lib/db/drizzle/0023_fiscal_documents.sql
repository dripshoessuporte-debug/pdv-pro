CREATE TABLE IF NOT EXISTS "fiscal_documents" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id"),
  "order_id" integer NOT NULL REFERENCES "orders"("id"),
  "provider" text NOT NULL DEFAULT 'focus_nfe',
  "document_type" text NOT NULL DEFAULT 'nfce',
  "environment" text NOT NULL DEFAULT 'homologation',
  "provider_reference" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "series" integer NOT NULL,
  "number" integer NOT NULL,
  "payload_version" text NOT NULL,
  "payload_hash" text NOT NULL,
  "payload_snapshot" jsonb NOT NULL,
  "provider_status" text,
  "access_key" text,
  "protocol" text,
  "xml_url" text,
  "danfce_url" text,
  "rejection_code" text,
  "rejection_message" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp with time zone,
  "last_checked_at" timestamp with time zone,
  "authorized_at" timestamp with time zone,
  "created_by_user_id" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fiscal_documents_provider_check" CHECK ("provider" IN ('focus_nfe')),
  CONSTRAINT "fiscal_documents_type_check" CHECK ("document_type" IN ('nfce')),
  CONSTRAINT "fiscal_documents_environment_check" CHECK ("environment" IN ('homologation')),
  CONSTRAINT "fiscal_documents_status_check" CHECK ("status" IN ('draft','submitting','processing','authorized','rejected','error','sync_pending','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_documents_order_unique" ON "fiscal_documents" ("store_id", "order_id", "document_type", "environment");
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_documents_reference_unique" ON "fiscal_documents" ("provider", "environment", "provider_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_documents_number_unique" ON "fiscal_documents" ("store_id", "environment", "series", "number");
CREATE INDEX IF NOT EXISTS "fiscal_documents_store_id_idx" ON "fiscal_documents" ("store_id");
