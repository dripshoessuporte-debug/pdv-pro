import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export function isRuntimeSchemaRepairEnabled() {
  return (
    process.env.ENABLE_RUNTIME_SCHEMA_REPAIR === "true" ||
    (process.env.ENABLE_RUNTIME_SCHEMA_REPAIR !== "false" &&
      process.env.NODE_ENV !== "production")
  );
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await db.execute(sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = ${tableName}
    ) as exists
  `);
  return Boolean(result.rows[0]?.exists);
}

async function columnExists(
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as exists
  `);
  return Boolean(result.rows[0]?.exists);
}

async function addColumnIfMissing(
  tableName: string,
  columnName: string,
  definitionSql: string,
): Promise<void> {
  if (await columnExists(tableName, columnName)) return;
  await db.execute(sql.raw(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definitionSql}`));
}

export async function ensureBillingRuntimeSchema() {
  if (!isRuntimeSchemaRepairEnabled()) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_entitlements" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL REFERENCES "users"("id"),
      "plan" text,
      "status" text NOT NULL DEFAULT 'pending',
      "source" text NOT NULL DEFAULT 'system',
      "provider" text,
      "external_customer_id" text,
      "external_order_id" text,
      "external_ref_id" text,
      "external_subscription_id" text,
      "current_period_start" timestamp with time zone,
      "current_period_end" timestamp with time zone,
      "trial_ends_at" timestamp with time zone,
      "activated_at" timestamp with time zone,
      "cancelled_at" timestamp with time zone,
      "blocked_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "user_entitlements_user_unique" ON "user_entitlements" ("user_id")`);
  await addColumnIfMissing("user_entitlements", "provider", "text");
  await addColumnIfMissing("user_entitlements", "external_customer_id", "text");
  await addColumnIfMissing("user_entitlements", "external_order_id", "text");
  await addColumnIfMissing("user_entitlements", "external_ref_id", "text");
  await addColumnIfMissing("user_entitlements", "external_subscription_id", "text");
  await addColumnIfMissing("user_entitlements", "current_period_start", "timestamp with time zone");
  await addColumnIfMissing("user_entitlements", "current_period_end", "timestamp with time zone");
  await addColumnIfMissing("user_entitlements", "trial_ends_at", "timestamp with time zone");
  await addColumnIfMissing("user_entitlements", "activated_at", "timestamp with time zone");
  await addColumnIfMissing("user_entitlements", "cancelled_at", "timestamp with time zone");
  await addColumnIfMissing("user_entitlements", "blocked_at", "timestamp with time zone");

  await db.execute(sql`
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
    )
  `);
  await addColumnIfMissing("billing_provider_products", "external_product_id", "text");
  await addColumnIfMissing("billing_provider_products", "external_product_short_id", "text");
  await addColumnIfMissing("billing_provider_products", "external_offer_id", "text");
  await addColumnIfMissing("billing_provider_products", "product_name", "text");
  await addColumnIfMissing("billing_provider_products", "offer_name", "text");
  await addColumnIfMissing("billing_provider_products", "checkout_url", "text");
  await addColumnIfMissing("billing_provider_products", "active", "boolean NOT NULL DEFAULT true");

  await db.execute(sql`
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
      "raw_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "processed_at" timestamp with time zone,
      "error_message" text,
      "created_user_id" integer REFERENCES "users"("id"),
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await addColumnIfMissing("billing_webhook_events", "external_event_id", "text");
  await addColumnIfMissing("billing_webhook_events", "external_order_id", "text");
  await addColumnIfMissing("billing_webhook_events", "external_ref_id", "text");
  await addColumnIfMissing("billing_webhook_events", "external_subscription_id", "text");
  await addColumnIfMissing("billing_webhook_events", "event_type", "text");
  await addColumnIfMissing("billing_webhook_events", "payment_status", "text");
  await addColumnIfMissing("billing_webhook_events", "processing_status", "text NOT NULL DEFAULT 'received'");
  await addColumnIfMissing("billing_webhook_events", "email", "text");
  await addColumnIfMissing("billing_webhook_events", "plan", "text");
  await addColumnIfMissing("billing_webhook_events", "raw_payload", "jsonb NOT NULL DEFAULT '{}'::jsonb");
  await addColumnIfMissing("billing_webhook_events", "processed_at", "timestamp with time zone");
  await addColumnIfMissing("billing_webhook_events", "error_message", "text");
  await addColumnIfMissing("billing_webhook_events", "created_user_id", "integer");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_activation_tokens" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL REFERENCES "users"("id"),
      "token_hash" text NOT NULL,
      "expires_at" timestamp with time zone NOT NULL,
      "used_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "user_activation_tokens_token_hash_unique" ON "user_activation_tokens" ("token_hash")`);
  await addColumnIfMissing("user_activation_tokens", "used_at", "timestamp with time zone");

  await ensureAccessRequestsTable();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "platform_audit_logs" (
      "id" serial PRIMARY KEY NOT NULL,
      "actor_user_id" integer REFERENCES "users"("id"),
      "actor_email" text,
      "action" text NOT NULL,
      "target_type" text,
      "target_id" text,
      "metadata" jsonb,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "platform_support_sessions" (
      "id" serial PRIMARY KEY NOT NULL,
      "actor_user_id" integer NOT NULL REFERENCES "users"("id"),
      "actor_email" text NOT NULL,
      "target_store_id" integer NOT NULL REFERENCES "stores"("id"),
      "target_store_name" text,
      "mode" text NOT NULL DEFAULT 'read_only',
      "reason" text NOT NULL DEFAULT 'Suporte administrativo',
      "status" text NOT NULL DEFAULT 'active',
      "started_at" timestamp with time zone NOT NULL DEFAULT now(),
      "expires_at" timestamp with time zone NOT NULL DEFAULT (now() + interval '2 hours'),
      "ended_at" timestamp with time zone,
      "ended_reason" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);

  await seedCaktoProductsIfEmpty();
}

async function seedCaktoProductsIfEmpty() {
  if (!(await tableExists("billing_provider_products"))) return;

  const result = await db.execute(sql`
    select count(*)::int as count
    from "billing_provider_products"
    where "provider" = 'cakto'
  `);
  const count = Number(result.rows[0]?.count ?? 0);
  if (count > 0) return;

  await db.execute(sql`
    INSERT INTO "billing_provider_products" ("provider", "product_name", "plan", "checkout_url", "active")
    VALUES
      ('cakto', 'Gestor Max Start', 'basico', 'https://pay.cakto.com.br/ard3kvt_928192', true),
      ('cakto', 'Gestor Max Delivery', 'medio', 'https://pay.cakto.com.br/3dt6vgh_928927', true),
      ('cakto', 'Gestor Max Pro', 'pro', 'https://pay.cakto.com.br/ocg5bpv_928934', true)
  `);
}

export async function ensureAccessRequestsTable() {
  if (!isRuntimeSchemaRepairEnabled()) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS access_requests (
      id serial primary key,
      name text not null,
      email text not null,
      phone text not null,
      restaurant_name text not null,
      requested_plan text not null,
      message text,
      status text not null default 'pending',
      created_user_id integer references users(id),
      reviewed_by integer references users(id),
      reviewed_at timestamp with time zone,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now()
    )
  `);

  await addColumnIfMissing("access_requests", "name", "text");
  await addColumnIfMissing("access_requests", "email", "text");
  await addColumnIfMissing("access_requests", "phone", "text");
  await addColumnIfMissing("access_requests", "restaurant_name", "text");
  await addColumnIfMissing("access_requests", "requested_plan", "text");
  await addColumnIfMissing("access_requests", "message", "text");
  await addColumnIfMissing("access_requests", "status", "text DEFAULT 'pending'");
  await addColumnIfMissing("access_requests", "created_user_id", "integer");
  await addColumnIfMissing("access_requests", "reviewed_by", "integer");
  await addColumnIfMissing("access_requests", "reviewed_at", "timestamp with time zone");
  await addColumnIfMissing("access_requests", "created_at", "timestamp with time zone DEFAULT now()");
  await addColumnIfMissing("access_requests", "updated_at", "timestamp with time zone DEFAULT now()");
}
