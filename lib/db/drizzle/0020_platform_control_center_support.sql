CREATE TABLE IF NOT EXISTS "platform_audit_logs" (
  "id" serial PRIMARY KEY,
  "actor_user_id" integer REFERENCES "users"("id"),
  "actor_email" text,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "platform_support_sessions" (
  "id" serial PRIMARY KEY,
  "actor_user_id" integer NOT NULL REFERENCES "users"("id"),
  "actor_email" text NOT NULL,
  "target_store_id" integer NOT NULL REFERENCES "stores"("id"),
  "target_store_name" text,
  "mode" text NOT NULL DEFAULT 'read_only',
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "ended_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "platform_audit_logs_created_at_idx" ON "platform_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "platform_support_sessions_status_idx" ON "platform_support_sessions" ("status");
CREATE INDEX IF NOT EXISTS "platform_support_sessions_target_store_idx" ON "platform_support_sessions" ("target_store_id");
