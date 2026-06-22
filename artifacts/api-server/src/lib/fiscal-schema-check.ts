import { pool } from "@workspace/db";

export async function checkFiscalSchema(): Promise<void> {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS store_fiscal_presentation (id serial PRIMARY KEY, store_id integer NOT NULL REFERENCES stores(id), mode text NOT NULL DEFAULT 'simplified', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())",
  );
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS store_fiscal_presentation_store_unique ON store_fiscal_presentation (store_id)",
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS fiscal_group_presentation (id serial PRIMARY KEY, store_id integer NOT NULL REFERENCES stores(id), fiscal_group_id integer NOT NULL REFERENCES fiscal_groups(id), document_description text, allow_aggregation boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())",
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS fiscal_group_presentation_store_idx ON fiscal_group_presentation (store_id)",
  );
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS fiscal_group_presentation_group_unique ON fiscal_group_presentation (store_id, fiscal_group_id)",
  );
}
