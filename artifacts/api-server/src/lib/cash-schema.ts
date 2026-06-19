import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

let done = false;

export async function prepareCashSchema() {
  if (done) return;

  await db.execute(sql.raw('ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "actor_user_id" integer'));
  await db.execute(sql.raw('ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "actor_name" text'));
  await db.execute(sql.raw('ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "actor_role" text'));

  done = true;
}
