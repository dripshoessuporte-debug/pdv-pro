import { pool } from "@workspace/db";

export async function checkFiscalSchema(): Promise<void> {
  await pool.query("SELECT 1");
}
