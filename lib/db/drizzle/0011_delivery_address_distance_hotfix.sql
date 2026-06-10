ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_number" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_city" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_state" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_complement" text;

ALTER TABLE "delivery_distance_cache" ADD COLUMN IF NOT EXISTS "address_hash" text NOT NULL DEFAULT '';
ALTER TABLE "delivery_distance_cache" DROP CONSTRAINT IF EXISTS "ddcache_origin_dest_provider";
ALTER TABLE "delivery_distance_cache" ADD CONSTRAINT "ddcache_origin_dest_provider_address" UNIQUE ("origin_cep", "destination_cep", "provider", "address_hash");

DELETE FROM "delivery_distance_cache" WHERE "distance_km"::numeric > 100;
