DO $$
DECLARE
  demo_store_id integer;
  demo_store_two_id integer;
  admin_user_id integer;
  atendente_user_id integer;
  cozinha_user_id integer;
  motoboy_user_id integer;
  demo_password_hash text := 'scrypt$16384$8$1$K9RaWiNGXelywFnfrh36mQ$ZsEOmn0cuOqbRgjH9Vd0p3B8jQZp5NXohMbjyeQVbKxF0Z4ZbS2ECc31qDyL74_ofoj8G6Llvp5d8Xm_XGJ8eA';
BEGIN
  INSERT INTO "stores" ("name", "slug", "status")
  VALUES
    ('Loja Demo', 'loja-demo', 'active'),
    ('Loja Demo 2', 'loja-demo-2', 'active')
  ON CONFLICT ("slug") DO UPDATE SET
    "name" = EXCLUDED."name",
    "status" = 'active',
    "updated_at" = now();

  SELECT "id" INTO demo_store_id FROM "stores" WHERE "slug" = 'loja-demo' LIMIT 1;
  SELECT "id" INTO demo_store_two_id FROM "stores" WHERE "slug" = 'loja-demo-2' LIMIT 1;

  INSERT INTO "users" ("name", "email", "password_hash", "status")
  VALUES
    ('Administrador Demo', 'admin@gestormax.local', demo_password_hash, 'active'),
    ('Atendente Demo', 'atendente@gestormax.local', demo_password_hash, 'active'),
    ('Cozinha Demo', 'cozinha@gestormax.local', demo_password_hash, 'active'),
    ('Motoboy Demo', 'motoboy@gestormax.local', demo_password_hash, 'active')
  ON CONFLICT ("email") DO UPDATE SET
    "name" = EXCLUDED."name",
    "password_hash" = CASE
      WHEN "users"."password_hash" IS NULL OR "users"."password_hash" = ''
      THEN EXCLUDED."password_hash"
      ELSE "users"."password_hash"
    END,
    "status" = 'active',
    "updated_at" = now();

  SELECT "id" INTO admin_user_id FROM "users" WHERE "email" = 'admin@gestormax.local' LIMIT 1;
  SELECT "id" INTO atendente_user_id FROM "users" WHERE "email" = 'atendente@gestormax.local' LIMIT 1;
  SELECT "id" INTO cozinha_user_id FROM "users" WHERE "email" = 'cozinha@gestormax.local' LIMIT 1;
  SELECT "id" INTO motoboy_user_id FROM "users" WHERE "email" = 'motoboy@gestormax.local' LIMIT 1;

  INSERT INTO "store_members" ("store_id", "user_id", "role", "is_default", "active")
  VALUES
    (demo_store_id, admin_user_id, 'max_control', true, true),
    (demo_store_two_id, admin_user_id, 'max_control', false, true),
    (demo_store_id, atendente_user_id, 'atendente', true, true),
    (demo_store_id, cozinha_user_id, 'cozinha', true, true),
    (demo_store_id, motoboy_user_id, 'motoboy', true, true)
  ON CONFLICT ("store_id", "user_id") DO UPDATE SET
    "role" = EXCLUDED."role",
    "is_default" = EXCLUDED."is_default",
    "active" = true,
    "updated_at" = now();
END $$;
