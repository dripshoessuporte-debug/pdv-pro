import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const sql = await readFile(
  new URL("./drizzle/0021_fiscal_presentation_modes.sql", import.meta.url),
  "utf8",
);
const pool = new pg.Pool({ connectionString });

try {
  await pool.query(sql);
} finally {
  await pool.end();
}
