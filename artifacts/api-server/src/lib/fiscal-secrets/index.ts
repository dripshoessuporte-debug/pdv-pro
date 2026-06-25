import { and, eq } from "drizzle-orm";
import { db, fiscalProviderCredentialsTable } from "@workspace/db";
import type { FocusNfeEnvironment } from "../../integrations/focus-nfe";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "./crypto";
export { decryptSecret, encryptSecret, FiscalSecretsError } from "./crypto";

export type FiscalProvider = "focus_nfe";
export type FiscalCredentialType = "api_token";

type StoreCredentialKey = {
  storeId: number;
  provider?: FiscalProvider;
  environment: FocusNfeEnvironment;
  credentialType?: FiscalCredentialType;
};

const whereCredential = ({ storeId, provider = "focus_nfe", environment, credentialType = "api_token" }: StoreCredentialKey) =>
  and(
    eq(fiscalProviderCredentialsTable.storeId, storeId),
    eq(fiscalProviderCredentialsTable.provider, provider),
    eq(fiscalProviderCredentialsTable.environment, environment),
    eq(fiscalProviderCredentialsTable.credentialType, credentialType),
  );

export async function saveStoreFiscalCredential(params: StoreCredentialKey & { value: string }): Promise<"created" | "replaced"> {
  const encrypted = encryptSecret(params.value);
  const [existing] = await db.select({ id: fiscalProviderCredentialsTable.id }).from(fiscalProviderCredentialsTable).where(whereCredential(params)).limit(1);
  await db
    .insert(fiscalProviderCredentialsTable)
    .values({
      storeId: params.storeId,
      provider: params.provider ?? "focus_nfe",
      environment: params.environment,
      credentialType: params.credentialType ?? "api_token",
      ...encrypted,
    })
    .onConflictDoUpdate({
      target: [
        fiscalProviderCredentialsTable.storeId,
        fiscalProviderCredentialsTable.provider,
        fiscalProviderCredentialsTable.environment,
        fiscalProviderCredentialsTable.credentialType,
      ],
      set: { ...encrypted, updatedAt: new Date() },
    });
  return existing ? "replaced" : "created";
}

export async function getStoreFiscalCredential(params: StoreCredentialKey): Promise<string | null> {
  const [row] = await db
    .select({
      encryptedValue: fiscalProviderCredentialsTable.encryptedValue,
      initializationVector: fiscalProviderCredentialsTable.initializationVector,
      authenticationTag: fiscalProviderCredentialsTable.authenticationTag,
      keyVersion: fiscalProviderCredentialsTable.keyVersion,
    })
    .from(fiscalProviderCredentialsTable)
    .where(whereCredential(params))
    .limit(1);
  return row ? decryptSecret(row) : null;
}

export async function hasStoreFiscalCredential(params: StoreCredentialKey): Promise<boolean> {
  const [row] = await db.select({ id: fiscalProviderCredentialsTable.id }).from(fiscalProviderCredentialsTable).where(whereCredential(params)).limit(1);
  return Boolean(row);
}

export async function deleteStoreFiscalCredential(params: StoreCredentialKey): Promise<boolean> {
  const deleted = await db.delete(fiscalProviderCredentialsTable).where(whereCredential(params)).returning({ id: fiscalProviderCredentialsTable.id });
  return deleted.length > 0;
}
