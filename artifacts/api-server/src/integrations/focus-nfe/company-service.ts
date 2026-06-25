import { eq } from "drizzle-orm";
import { db, fiscalAuditLogsTable, storeFiscalSettingsTable } from "@workspace/db";
import { FocusNfeClient } from "./client";
import { resolveFocusNfeToken } from "./config";
import type { FocusNfeEnvironment, FocusNfeResult, FocusNfeStoreContext } from "./types";
import { getStoreFiscalCredential, hasStoreFiscalCredential, saveStoreFiscalCredential } from "../../lib/fiscal-secrets";

export type LinkFocusCompanyInput = {
  storeId: number;
  actorUserId?: number | null;
  providerCompanyId: string;
  homologationToken: string;
  productionToken?: string;
};

export async function resolveStoreFocusCredentials(params: { storeId: number; environment: FocusNfeEnvironment }): Promise<FocusNfeStoreContext> {
  const token = await getStoreFiscalCredential({ storeId: params.storeId, provider: "focus_nfe", environment: params.environment, credentialType: "api_token" });
  if (!token) throw new Error("Credencial Focus NFe da loja não configurada para o ambiente fiscal.");
  const [settings] = await db.select({ providerCompanyId: storeFiscalSettingsTable.providerCompanyId }).from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId, params.storeId)).limit(1);
  return { storeId: params.storeId, environment: params.environment, credentials: { token, tokenReference: "fiscal_provider_credentials" }, providerCompanyId: settings?.providerCompanyId ?? null };
}

export async function getFocusCompanySummary(storeId: number) {
  const [settings] = await db
    .select({
      provider: storeFiscalSettingsTable.provider,
      environment: storeFiscalSettingsTable.environment,
      providerCompanyId: storeFiscalSettingsTable.providerCompanyId,
      certificateReference: storeFiscalSettingsTable.certificateReference,
      certificateStatus: storeFiscalSettingsTable.certificateStatus,
      setupStatus: storeFiscalSettingsTable.setupStatus,
    })
    .from(storeFiscalSettingsTable)
    .where(eq(storeFiscalSettingsTable.storeId, storeId))
    .limit(1);
  return {
    provider: settings?.provider ?? "focus_nfe",
    environment: settings?.environment === "production" ? "production" : "homologation",
    companyLinked: Boolean(settings?.providerCompanyId),
    providerCompanyId: settings?.providerCompanyId ?? null,
    homologationCredentialConfigured: await hasStoreFiscalCredential({ storeId, provider: "focus_nfe", environment: "homologation", credentialType: "api_token" }),
    productionCredentialConfigured: await hasStoreFiscalCredential({ storeId, provider: "focus_nfe", environment: "production", credentialType: "api_token" }),
    certificateConfigured: Boolean(settings?.certificateReference && settings.certificateStatus !== "invalid"),
    setupStatus: settings?.setupStatus ?? "not_configured",
  };
}

export async function linkExistingFocusCompany(input: LinkFocusCompanyInput) {
  const homologationStatus = await saveStoreFiscalCredential({ storeId: input.storeId, provider: "focus_nfe", environment: "homologation", credentialType: "api_token", value: input.homologationToken });
  let productionStatus: "created" | "replaced" | null = null;
  if (input.productionToken) {
    productionStatus = await saveStoreFiscalCredential({ storeId: input.storeId, provider: "focus_nfe", environment: "production", credentialType: "api_token", value: input.productionToken });
  }
  await db
    .insert(storeFiscalSettingsTable)
    .values({ storeId: input.storeId, provider: "focus_nfe", environment: "homologation", providerCompanyId: input.providerCompanyId, setupStatus: "configuring", configuredByUserId: input.actorUserId ?? null })
    .onConflictDoUpdate({ target: storeFiscalSettingsTable.storeId, set: { provider: "focus_nfe", providerCompanyId: input.providerCompanyId, setupStatus: "configuring", configuredByUserId: input.actorUserId ?? null, updatedAt: new Date() } });
  await audit(input.storeId, input.actorUserId, "focus_company_linked", input.providerCompanyId, { status: "linked" });
  await audit(input.storeId, input.actorUserId, homologationStatus === "created" ? "focus_credential_created" : "focus_credential_replaced", input.providerCompanyId, { environment: "homologation" });
  if (productionStatus) await audit(input.storeId, input.actorUserId, productionStatus === "created" ? "focus_credential_created" : "focus_credential_replaced", input.providerCompanyId, { environment: "production" });
  return getFocusCompanySummary(input.storeId);
}

async function audit(storeId: number, actorUserId: number | null | undefined, action: string, providerCompanyId: string, metadata: Record<string, unknown>) {
  await db.insert(fiscalAuditLogsTable).values({ storeId, actorUserId: actorUserId ?? null, action, targetType: "focus_company", targetId: providerCompanyId, metadata: { providerCompanyId, ...metadata } });
}

export async function getRegisteredFocusCompany(params: { storeId: number; environment: FocusNfeEnvironment; providerCompanyId: string; client?: FocusNfeClient }): Promise<FocusNfeResult<unknown>> {
  const context = await resolveStoreFocusCredentials({ storeId: params.storeId, environment: params.environment });
  return (params.client ?? new FocusNfeClient()).request(context, { method: "GET", path: `/v2/empresas/${encodeURIComponent(params.providerCompanyId)}` });
}

export async function registerFocusCompany(): Promise<never> {
  const adminToken = resolveFocusNfeToken("production").token;
  if (!adminToken) throw new Error("Token administrativo Focus NFe não configurado para cadastro de empresas.");
  throw new Error("Cadastro automático de empresas Focus NFe não habilitado neste PR; use o vínculo de empresa já criada.");
}
