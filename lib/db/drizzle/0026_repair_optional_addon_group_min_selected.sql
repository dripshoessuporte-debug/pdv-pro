UPDATE "addon_groups"
SET "min_selected" = 0
WHERE "required" = false
  AND "min_selected" > 0;
