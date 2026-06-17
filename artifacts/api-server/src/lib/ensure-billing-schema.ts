import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export function isRuntimeSchemaRepairEnabled() {
  return process.env.ENABLE_RUNTIME_SCHEMA_REPAIR === "true" || (process.env.ENABLE_RUNTIME_SCHEMA_REPAIR !== "false" && process.env.NODE_ENV !== "production");
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

  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS name text`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS email text`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS phone text`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS restaurant_name text`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS requested_plan text`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS message text`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS created_user_id integer`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS reviewed_by integer`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
}
