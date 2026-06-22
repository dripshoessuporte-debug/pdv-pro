import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const OPENROUTESERVICE_PROVIDER = "openrouteservice";
let schemaPromise: Promise<void> | null = null;

type SecretSource = "store" | "platform" | "none";

export type StoreIntegrationSecretStatus = {
  configured: boolean;
  source: SecretSource;
  masked: string | null;
};

function getEncryptionKey(): Buffer {
  const source =
    process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.SESSION_SECRET;

  if (!source || source.length < 32) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY ou SESSION_SECRET deve ter ao menos 32 caracteres.",
    );
  }

  return crypto.createHash("sha256").update(source).digest();
}

function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptSecret(payload: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Formato de segredo inválido.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

export function normalizeOpenRouteServiceKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (key.length < 20 || key.length > 512 || /\s/.test(key)) {
    throw new Error("Informe uma chave OpenRouteService válida.");
  }
  return key;
}

async function ensureSecretSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "store_integration_secrets" (
          "id" serial PRIMARY KEY NOT NULL,
          "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
          "provider" text NOT NULL,
          "encrypted_value" text NOT NULL,
          "created_at" timestamp with time zone NOT NULL DEFAULT now(),
          "updated_at" timestamp with time zone NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "store_integration_secrets_store_provider_unique"
        ON "store_integration_secrets" ("store_id", "provider")
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
}

async function getStoredSecret(storeId: number): Promise<string | null> {
  await ensureSecretSchema();
  const result = await db.execute(sql`
    SELECT "encrypted_value"
    FROM "store_integration_secrets"
    WHERE "store_id" = ${storeId}
      AND "provider" = ${OPENROUTESERVICE_PROVIDER}
    LIMIT 1
  `);

  const row = result.rows[0] as { encrypted_value?: unknown } | undefined;
  return typeof row?.encrypted_value === "string"
    ? decryptSecret(row.encrypted_value)
    : null;
}

export async function getStoreOpenRouteServiceKey(storeId: number): Promise<{
  apiKey: string | null;
  source: SecretSource;
}> {
  const storeKey = await getStoredSecret(storeId);
  if (storeKey) return { apiKey: storeKey, source: "store" };

  const platformKey = process.env.OPENROUTESERVICE_API_KEY?.trim() || null;
  return platformKey
    ? { apiKey: platformKey, source: "platform" }
    : { apiKey: null, source: "none" };
}

export async function getStoreOpenRouteServiceStatus(
  storeId: number,
): Promise<StoreIntegrationSecretStatus> {
  const resolved = await getStoreOpenRouteServiceKey(storeId);
  return {
    configured: Boolean(resolved.apiKey),
    source: resolved.source,
    masked: resolved.apiKey ? maskSecret(resolved.apiKey) : null,
  };
}

export async function saveStoreOpenRouteServiceKey(
  storeId: number,
  rawKey: unknown,
): Promise<void> {
  const apiKey = normalizeOpenRouteServiceKey(rawKey);
  const encryptedValue = encryptSecret(apiKey);
  await ensureSecretSchema();

  await db.execute(sql`
    INSERT INTO "store_integration_secrets" (
      "store_id",
      "provider",
      "encrypted_value",
      "updated_at"
    )
    VALUES (
      ${storeId},
      ${OPENROUTESERVICE_PROVIDER},
      ${encryptedValue},
      now()
    )
    ON CONFLICT ("store_id", "provider")
    DO UPDATE SET
      "encrypted_value" = EXCLUDED."encrypted_value",
      "updated_at" = now()
  `);
}

export async function deleteStoreOpenRouteServiceKey(
  storeId: number,
): Promise<void> {
  await ensureSecretSchema();
  await db.execute(sql`
    DELETE FROM "store_integration_secrets"
    WHERE "store_id" = ${storeId}
      AND "provider" = ${OPENROUTESERVICE_PROVIDER}
  `);
}
