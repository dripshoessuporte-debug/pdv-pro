const DEFAULT_MAX_DISTANCE_KM = 80;
const DEFAULT_MAX_DELIVERY_FEE = 500;

function parsePositiveNumber(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to clean delivery distances.");
  }

  const confirmed = process.argv.includes("--confirm");
  const maxDistanceKm = parsePositiveNumber(
    readFlag("max-distance-km") ?? process.env.MAX_ALLOWED_DELIVERY_DISTANCE_KM,
    DEFAULT_MAX_DISTANCE_KM,
  );
  const maxDeliveryFee = parsePositiveNumber(
    readFlag("max-delivery-fee") ?? process.env.MAX_ALLOWED_DELIVERY_FEE,
    DEFAULT_MAX_DELIVERY_FEE,
  );

  const { pool } = await import("@workspace/db");

  try {
    const cacheCount = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM delivery_distance_cache
        WHERE distance_km::numeric > $1
      `,
      [maxDistanceKm],
    );

    const orderDistanceCount = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM orders
        WHERE estimated_distance_km IS NOT NULL
          AND estimated_distance_km::numeric > $1
      `,
      [maxDistanceKm],
    );

    const orderFeeCount = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM orders
        WHERE estimated_distance_km IS NOT NULL
          AND estimated_distance_km::numeric > $1
          AND delivery_fee_calculated = 'true'
          AND delivery_fee::numeric > $2
      `,
      [maxDistanceKm, maxDeliveryFee],
    );

    console.log(
      JSON.stringify(
        {
          mode: confirmed ? "apply" : "dry-run",
          maxDistanceKm,
          maxDeliveryFee,
          cacheRowsAboveLimit: Number(cacheCount.rows[0]?.count ?? 0),
          ordersWithDistanceAboveLimit: Number(
            orderDistanceCount.rows[0]?.count ?? 0,
          ),
          ordersWithCalculatedFeeAboveLimit: Number(
            orderFeeCount.rows[0]?.count ?? 0,
          ),
        },
        null,
        2,
      ),
    );

    if (!confirmed) {
      console.log(
        "Dry-run only. Re-run with --confirm to delete contaminated cache rows and reset contaminated order fields.",
      );
      return;
    }

    await pool.query("BEGIN");
    try {
      const deletedCache = await pool.query<{ id: number }>(
        `
          DELETE FROM delivery_distance_cache
          WHERE distance_km::numeric > $1
          RETURNING id
        `,
        [maxDistanceKm],
      );

      const resetFees = await pool.query<{ id: number }>(
        `
          UPDATE orders
          SET delivery_fee = '0',
              delivery_fee_calculated = 'false',
              delivery_fee_source = NULL,
              updated_at = now()
          WHERE estimated_distance_km IS NOT NULL
            AND estimated_distance_km::numeric > $1
            AND delivery_fee_calculated = 'true'
            AND delivery_fee::numeric > $2
          RETURNING id
        `,
        [maxDistanceKm, maxDeliveryFee],
      );

      const resetOrders = await pool.query<{ id: number }>(
        `
          UPDATE orders
          SET estimated_distance_km = NULL,
              delivery_distance_source = NULL,
              updated_at = now()
          WHERE estimated_distance_km IS NOT NULL
            AND estimated_distance_km::numeric > $1
          RETURNING id
        `,
        [maxDistanceKm],
      );

      await pool.query("COMMIT");

      console.log(
        JSON.stringify(
          {
            deletedCacheRows: deletedCache.rowCount ?? deletedCache.rows.length,
            resetOrderFeeRows: resetFees.rowCount ?? resetFees.rows.length,
            resetOrderDistanceRows:
              resetOrders.rowCount ?? resetOrders.rows.length,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

export {};
