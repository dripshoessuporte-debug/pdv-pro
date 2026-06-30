CREATE UNIQUE INDEX IF NOT EXISTS "products_store_id_id_unique_idx" ON "products" ("store_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "addon_groups_store_id_id_unique_idx" ON "addon_groups" ("store_id", "id");

DO $$ BEGIN
  ALTER TABLE "multiflavor_flavors"
    ADD CONSTRAINT "multiflavor_flavors_product_store_fk"
    FOREIGN KEY ("store_id", "product_id") REFERENCES "products"("store_id", "id") ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "multiflavor_group_addon_groups"
    ADD CONSTRAINT "multiflavor_group_addon_groups_addon_group_store_fk"
    FOREIGN KEY ("store_id", "addon_group_id") REFERENCES "addon_groups"("store_id", "id") ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
