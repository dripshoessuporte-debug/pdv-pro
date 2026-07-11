import { and, eq } from "drizzle-orm";
import { db, fiscalProviderCredentialsTable } from "@workspace/db";
import type { FocusNfeEnvironment } from "../../integrations/focus-nfe";
import { decryptSecret, encryptSecret } from "./crypto";
export { decryptSecret, encryptSecret, encryptionKeyFromEnv, FiscalSecretsError } from "./crypto";

export type FiscalProvider = "focus_nfe";
export type FiscalCredentialType = "api_token" | "csc_secret";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

type StoreCredentialKey = {
  storeId: number;
  provider?: FiscalProvider;
  environment: FocusNfeEnvironment;
  credentialType?: FiscalCredentialType;
  executor?: DbExecutor;
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
  const executor = params.executor ?? db;
  const [existing] = await executor.select({ id: fiscalProviderCredentialsTable.id }).from(fiscalProviderCredentialsTable).where(whereCredential(params)).limit(1);
  await executor
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
  const executor = params.executor ?? db;
  const [row] = await executor
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
  const executor = params.executor ?? db;
  const [row] = await executor.select({ id: fiscalProviderCredentialsTable.id }).from(fiscalProviderCredentialsTable).where(whereCredential(params)).limit(1);
  return Boolean(row);
}

export async function deleteStoreFiscalCredential(params: StoreCredentialKey): Promise<boolean> {
  const executor = params.executor ?? db;
  const deleted = await executor.delete(fiscalProviderCredentialsTable).where(whereCredential(params)).returning({ id: fiscalProviderCredentialsTable.id });
  return deleted.length > 0;
}
