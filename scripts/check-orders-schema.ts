const REQUIRED_ORDER_COLUMNS = [
  "delivery_number",
  "delivery_city",
  "delivery_state",
  "delivery_complement",
  "source",
  "external_order_id",
  "raw_payload",
  "integration_status",
  "estimated_distance_km",
  "delivery_fee_calculated",
  "delivery_fee_source",
  "delivery_distance_source",
] as const;

const MIGRATION_HINT =
  "Banco desalinhado com o schema. Rode pnpm --filter @workspace/db db:migrate";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to check the orders schema.");
  }

  const { pool } = await import("@workspace/db");

  try {
    const { rows } = await pool.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = ANY($1::text[])
      `,
      [REQUIRED_ORDER_COLUMNS],
    );

    const existingColumns = new Set(
      rows.map((row: { column_name: string }) => row.column_name),
    );
    const missingColumns = REQUIRED_ORDER_COLUMNS.filter(
      (column) => !existingColumns.has(column),
    );

    if (missingColumns.length > 0) {
      console.error(MIGRATION_HINT);
      console.error(`Colunas faltando em orders: ${missingColumns.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    console.log("Tabela orders alinhada com o schema esperado.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
