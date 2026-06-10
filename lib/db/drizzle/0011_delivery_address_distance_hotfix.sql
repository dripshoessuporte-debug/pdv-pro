ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_number" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_city" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_state" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_complement" text;
--> statement-breakpoint
ALTER TABLE "delivery_distance_cache" ADD COLUMN IF NOT EXISTS "address_hash" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "delivery_distance_cache" DROP CONSTRAINT IF EXISTS "ddcache_origin_dest_provider";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ddcache_origin_dest_provider_address'
      AND conrelid = 'delivery_distance_cache'::regclass
  ) THEN
    ALTER TABLE "delivery_distance_cache"
      ADD CONSTRAINT "ddcache_origin_dest_provider_address"
      UNIQUE ("origin_cep", "destination_cep", "provider", "address_hash");
  END IF;
END $$;
