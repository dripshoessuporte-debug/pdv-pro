import { and, eq, isNotNull } from "drizzle-orm";
import { db, fiscalAuditLogsTable, fiscalGroupRulesTable, fiscalGroupsTable, productFiscalSettingsTable, storeFiscalSettingsTable } from "@workspace/db";
import { FocusNfeClient } from "./client";
import { FocusNfeError } from "./errors";
import { resolveFocusNfeToken } from "./config";
import type { FocusNfeEnvironment, FocusNfeStoreContext } from "./types";
import { getStoreFiscalCredential, hasStoreFiscalCredential, saveStoreFiscalCredential } from "../../lib/fiscal-secrets";


export type FocusSetupErrorCode =
  | "CERTIFICATE_VALIDATION_ERROR"
  | "FOCUS_AUTHENTICATION_ERROR"
  | "FOCUS_CERTIFICATE_REJECTED"
  | "FOCUS_TIMEOUT"
  | "FOCUS_UNAVAILABLE"
  | "LOCAL_PERSISTENCE_ERROR"
  | "FOCUS_APPLIED_LOCAL_SYNC_FAILED"
  | "COMPANY_NOT_LINKED"
  | "STORE_CREDENTIAL_NOT_CONFIGURED";

export class FocusSetupError extends Error {
  constructor(readonly code: FocusSetupErrorCode, message: string, readonly status = 400, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FocusSetupError";
  }
}

function mapFocusError(error: unknown, certificate = false): FocusSetupError {
  if (error instanceof FocusNfeError) {
    if (error.kind === "authentication") return new FocusSetupError("FOCUS_AUTHENTICATION_ERROR", "A Focus NFe recusou a autenticação da credencial da loja.", 502, { cause: error });
    if (error.kind === "timeout") return new FocusSetupError("FOCUS_TIMEOUT", "Tempo esgotado ao comunicar com a Focus NFe. A configuração local anterior foi mantida.", 504, { cause: error });
    if (error.kind === "temporary_unavailable" || error.kind === "communication") return new FocusSetupError("FOCUS_UNAVAILABLE", "A Focus NFe está indisponível ou não respondeu. A configuração local anterior foi mantida.", 503, { cause: error });
    return new FocusSetupError(certificate ? "FOCUS_CERTIFICATE_REJECTED" : "FOCUS_UNAVAILABLE", certificate ? "A Focus NFe rejeitou o certificado. A configuração anterior foi mantida." : "A Focus NFe recusou a configuração. A configuração anterior foi mantida.", 422, { cause: error });
  }
  return new FocusSetupError("LOCAL_PERSISTENCE_ERROR", "Falha local ao configurar dados fiscais.", 500, { cause: error });
}

export type LinkFocusCompanyInput = { storeId: number; actorUserId?: number | null; providerCompanyId: string; homologationToken: string; productionToken?: string };

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

type FocusCompanyUpdateResponse = Record<string, unknown>;

export async function resolveStoreFocusCredentials(params: { storeId: number; environment: FocusNfeEnvironment }): Promise<FocusNfeStoreContext> {
  const token = await getStoreFiscalCredential({ storeId: params.storeId, provider: "focus_nfe", environment: params.environment, credentialType: "api_token" });
  if (!token) throw new FocusSetupError("STORE_CREDENTIAL_NOT_CONFIGURED", "Credencial Focus NFe da loja não configurada para o ambiente fiscal.");
  const [settings] = await db.select({ providerCompanyId: storeFiscalSettingsTable.providerCompanyId }).from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId, params.storeId)).limit(1);
  return { storeId: params.storeId, environment: params.environment, credentials: { token, tokenReference: "fiscal_provider_credentials" }, providerCompanyId: settings?.providerCompanyId ?? null };
}

export async function getFocusCompanySummary(storeId: number) {
  const [settings] = await db.select().from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId, storeId)).limit(1);
  const homologationCredentialConfigured = await hasStoreFiscalCredential({ storeId, provider: "focus_nfe", environment: "homologation", credentialType: "api_token" });
  const productionCredentialConfigured = await hasStoreFiscalCredential({ storeId, provider: "focus_nfe", environment: "production", credentialType: "api_token" });
  const certificateConfigured = Boolean(settings?.certificateReference);
  const certificateValidated = settings?.certificateStatus === "valid";
  const cscConfigured = Boolean(settings?.cscId && settings?.cscSecretReference);
  const missingRequirements = await getHomologationMissingRequirements(storeId, settings, homologationCredentialConfigured, certificateConfigured, certificateValidated, cscConfigured);
  return {
    provider: settings?.provider ?? "focus_nfe",
    environment: settings?.environment === "production" ? "production" : "homologation",
    companyLinked: Boolean(settings?.providerCompanyId), providerCompanyId: settings?.providerCompanyId ?? null,
    homologationCredentialConfigured, productionCredentialConfigured, certificateConfigured,
    certificateStatus: settings?.certificateStatus ?? null, certificateExpiresAt: settings?.certificateExpiresAt ?? null,
    cscConfigured, cscIdConfigured: Boolean(settings?.cscId), setupStatus: settings?.setupStatus ?? "not_configured",
    readyForHomologation: missingRequirements.length === 0, readyForProduction: false, missingRequirements,
  };
}

export async function linkExistingFocusCompany(input: LinkFocusCompanyInput) {
  await db.transaction(async (tx) => {
    const homologationStatus = await saveStoreFiscalCredential({ storeId: input.storeId, provider: "focus_nfe", environment: "homologation", credentialType: "api_token", value: input.homologationToken, executor: tx });
    let productionStatus: "created" | "replaced" | null = null;
    if (input.productionToken) productionStatus = await saveStoreFiscalCredential({ storeId: input.storeId, provider: "focus_nfe", environment: "production", credentialType: "api_token", value: input.productionToken, executor: tx });
    await tx.insert(storeFiscalSettingsTable).values({ storeId: input.storeId, provider: "focus_nfe", environment: "homologation", providerCompanyId: input.providerCompanyId, setupStatus: "configuring", configuredByUserId: input.actorUserId ?? null }).onConflictDoUpdate({ target: storeFiscalSettingsTable.storeId, set: { provider: "focus_nfe", providerCompanyId: input.providerCompanyId, setupStatus: "configuring", configuredByUserId: input.actorUserId ?? null, updatedAt: new Date() } });
    await audit(tx, input.storeId, input.actorUserId, "focus_company_linked", input.providerCompanyId, { status: "linked" });
    await audit(tx, input.storeId, input.actorUserId, homologationStatus === "created" ? "focus_credential_created" : "focus_credential_replaced", input.providerCompanyId, { environment: "homologation" });
    if (productionStatus) await audit(tx, input.storeId, input.actorUserId, productionStatus === "created" ? "focus_credential_created" : "focus_credential_replaced", input.providerCompanyId, { environment: "production" });
  });
  return getFocusCompanySummary(input.storeId);
}

async function audit(executor: DbExecutor, storeId: number, actorUserId: number | null | undefined, action: string, providerCompanyId: string, metadata: Record<string, unknown>) {
  await executor.insert(fiscalAuditLogsTable).values({ storeId, actorUserId: actorUserId ?? null, action, targetType: "focus_company", targetId: providerCompanyId, metadata: { providerCompanyId, ...metadata } });
}

function certMeta(providerCompanyId: string, _data: FocusCompanyUpdateResponse) {
  // Docs oficiais de PUT /v2/empresas/{id} documentam apenas sucesso de atualização; não documentam validade/CNPJ/nome/status do certificado na resposta.
  return { reference: `focus_company:${providerCompanyId}:certificate`, status: "submitted", expiresAt: null as Date | null };
}


export async function uploadFocusCertificate(input: { storeId: number; actorUserId?: number | null; filename: string; content: Buffer; password: string; client?: FocusNfeClient }) {
  try {
    validateCertificate(input.filename, input.content, input.password);
    const context = await resolveStoreFocusCredentials({ storeId: input.storeId, environment: "homologation" });
    if (!context.providerCompanyId) throw new FocusSetupError("COMPANY_NOT_LINKED", "Empresa Focus NFe ainda não vinculada à loja.");
    const previous = await getFocusCompanySummary(input.storeId);
    await audit(db, input.storeId, input.actorUserId, "certificate_upload_started", context.providerCompanyId, { environment: "homologation" });

    let result: { data: FocusCompanyUpdateResponse };
    try {
      const certificateBase64 = input.content.toString("base64");
      result = await (input.client ?? new FocusNfeClient()).request<FocusCompanyUpdateResponse>(context, { method: "PUT", path: `/v2/empresas/${encodeURIComponent(context.providerCompanyId)}`, body: { arquivo_certificado_base64: certificateBase64, senha_certificado: input.password } });
    } catch (error) {
      await audit(db, input.storeId, input.actorUserId, "certificate_focus_rejected", context.providerCompanyId, { environment: "homologation", errorCode: error instanceof FocusNfeError ? error.kind : "focus_error" });
      throw mapFocusError(error, true);
    }

    const meta = certMeta(context.providerCompanyId, result.data);
    try {
      await db.transaction(async (tx) => {
        await tx.insert(storeFiscalSettingsTable).values({ storeId: input.storeId, provider: "focus_nfe", environment: "homologation", providerCompanyId: context.providerCompanyId, certificateReference: meta.reference, certificateStatus: meta.status, certificateExpiresAt: meta.expiresAt, setupStatus: "configuring", configuredByUserId: input.actorUserId ?? null }).onConflictDoUpdate({ target: storeFiscalSettingsTable.storeId, set: { certificateReference: meta.reference, certificateStatus: meta.status, certificateExpiresAt: meta.expiresAt, configuredByUserId: input.actorUserId ?? null, updatedAt: new Date() } });
        await audit(tx, input.storeId, input.actorUserId, meta.status === "valid" ? "certificate_validated" : "certificate_focus_accepted", context.providerCompanyId!, { environment: "homologation", status: meta.status });
        if (previous.certificateConfigured) await audit(tx, input.storeId, input.actorUserId, "focus_certificate_replaced", context.providerCompanyId!, { environment: "homologation" });
      });
      await markReadyIfComplete(input.storeId, input.actorUserId, context.providerCompanyId);
    } catch (error) {
      await audit(db, input.storeId, input.actorUserId, "certificate_local_sync_failed", context.providerCompanyId, { environment: "homologation" });
      throw new FocusSetupError("FOCUS_APPLIED_LOCAL_SYNC_FAILED", "A configuração foi enviada à Focus, mas o Gestor Max não conseguiu sincronizar o estado local.", 500, { cause: error });
    }
    return getFocusCompanySummary(input.storeId);
  } finally {
    input.content.fill(0);
  }
}

export async function configureFocusCsc(input: { storeId: number; actorUserId?: number | null; cscId: string; cscSecret: string; client?: FocusNfeClient }) {
  const cscId = input.cscId.trim(); const cscSecret = input.cscSecret.trim();
  if (!/^\d{1,6}$/.test(cscId)) throw new Error("ID do CSC de homologação inválido.");
  if (cscSecret.length < 6 || cscSecret.length > 255) throw new Error("CSC de homologação inválido.");
  const context = await resolveStoreFocusCredentials({ storeId: input.storeId, environment: "homologation" });
  if (!context.providerCompanyId) throw new FocusSetupError("COMPANY_NOT_LINKED", "Empresa Focus NFe ainda não vinculada à loja.");
  const previous = await getFocusCompanySummary(input.storeId);
  try {
    await (input.client ?? new FocusNfeClient()).request(context, { method: "PUT", path: `/v2/empresas/${encodeURIComponent(context.providerCompanyId)}`, body: { csc_nfce_homologacao: cscSecret, id_token_nfce_homologacao: Number(cscId) } });
    await audit(db, input.storeId, input.actorUserId, "csc_focus_accepted", context.providerCompanyId, { environment: "homologation" });
  } catch (error) { throw mapFocusError(error); }
  try {
  await db.transaction(async (tx) => {
    await saveStoreFiscalCredential({ storeId: input.storeId, provider: "focus_nfe", environment: "homologation", credentialType: "csc_secret", value: cscSecret, executor: tx });
    await tx.insert(storeFiscalSettingsTable).values({ storeId: input.storeId, provider: "focus_nfe", environment: "homologation", providerCompanyId: context.providerCompanyId, cscId, cscSecretReference: "fiscal_provider_credentials:csc_secret:homologation", configuredByUserId: input.actorUserId ?? null }).onConflictDoUpdate({ target: storeFiscalSettingsTable.storeId, set: { cscId, cscSecretReference: "fiscal_provider_credentials:csc_secret:homologation", configuredByUserId: input.actorUserId ?? null, updatedAt: new Date() } });
    await audit(tx, input.storeId, input.actorUserId, "csc_configured", context.providerCompanyId!, { environment: "homologation", status: previous.cscConfigured ? "replaced" : "configured" });
  });
  } catch (error) {
    await audit(db, input.storeId, input.actorUserId, "csc_local_sync_failed", context.providerCompanyId, { environment: "homologation" });
    throw new FocusSetupError("FOCUS_APPLIED_LOCAL_SYNC_FAILED", "A configuração foi enviada à Focus, mas o Gestor Max não conseguiu sincronizar o estado local.", 500, { cause: error });
  }
  await markReadyIfComplete(input.storeId, input.actorUserId, context.providerCompanyId);
  return getFocusCompanySummary(input.storeId);
}

function validateCertificate(filename: string, content: Buffer, password: string) {
  if (!/\.(pfx|p12)$/i.test(filename)) throw new FocusSetupError("CERTIFICATE_VALIDATION_ERROR", "Envie um certificado A1 .pfx ou .p12.");
  if (content.length === 0) throw new FocusSetupError("CERTIFICATE_VALIDATION_ERROR", "O certificado enviado está vazio.");
  if (content.length > 5 * 1024 * 1024) throw new FocusSetupError("CERTIFICATE_VALIDATION_ERROR", "O certificado deve ter no máximo 5 MB.");
  if (!password) throw new FocusSetupError("CERTIFICATE_VALIDATION_ERROR", "Informe a senha do certificado.");
}

async function getHomologationMissingRequirements(storeId: number, settings: typeof storeFiscalSettingsTable.$inferSelect | undefined, token: boolean, cert: boolean, certValid: boolean, csc: boolean) {
  const missing: string[] = [];
  if (!settings?.providerCompanyId) missing.push("company_not_linked");
  if (!token) missing.push("homologation_token_missing");
  if (!cert) missing.push("certificate_missing");
  if (cert && !certValid) missing.push("certificate_not_validated");
  if (!csc) missing.push("csc_missing");
  if (!settings?.cnpj || !settings?.stateRegistration || !settings?.taxRegime || !settings?.state || !settings?.cityIbgeCode) missing.push("company_data_incomplete");
  if (!settings?.series || !settings?.nextNumber) missing.push("numbering_missing");
  const required = [isNotNull(fiscalGroupRulesTable.ncm), isNotNull(fiscalGroupRulesTable.cfop), isNotNull(fiscalGroupRulesTable.commercialUnit), isNotNull(fiscalGroupRulesTable.origin), isNotNull(fiscalGroupRulesTable.icmsCode), isNotNull(fiscalGroupRulesTable.pisCode), isNotNull(fiscalGroupRulesTable.cofinsCode)];
  const [rule] = await db.select({ id: fiscalGroupRulesTable.id }).from(fiscalGroupRulesTable).innerJoin(fiscalGroupsTable, eq(fiscalGroupRulesTable.fiscalGroupId, fiscalGroupsTable.id)).where(and(eq(fiscalGroupRulesTable.storeId, storeId), eq(fiscalGroupsTable.storeId, storeId), eq(fiscalGroupsTable.active, true), ...required)).limit(1);
  const [productRule] = await db.select({ id: productFiscalSettingsTable.id }).from(productFiscalSettingsTable).where(and(eq(productFiscalSettingsTable.storeId, storeId), eq(productFiscalSettingsTable.active, true), isNotNull(productFiscalSettingsTable.ncm), isNotNull(productFiscalSettingsTable.cfop), isNotNull(productFiscalSettingsTable.commercialUnit), isNotNull(productFiscalSettingsTable.origin), isNotNull(productFiscalSettingsTable.icmsCode), isNotNull(productFiscalSettingsTable.pisCode), isNotNull(productFiscalSettingsTable.cofinsCode))).limit(1);
  if (!rule && !productRule) missing.push("fiscal_rules_incomplete");
  return missing;
}

async function markReadyIfComplete(storeId: number, actorUserId: number | null | undefined, providerCompanyId: string | null | undefined) {
  const summary = await getFocusCompanySummary(storeId);
  if (summary.readyForHomologation && providerCompanyId) await db.transaction(async (tx) => { await tx.update(storeFiscalSettingsTable).set({ setupStatus: "homologation", updatedAt: new Date() }).where(eq(storeFiscalSettingsTable.storeId, storeId)); await audit(tx, storeId, actorUserId, "focus_setup_ready_for_homologation", providerCompanyId, { environment: "homologation", status: "ready" }); });
}

export async function getRegisteredFocusCompany(): Promise<never> { throw new Error("Consulta GET /v2/empresas/{id} desabilitada: a documentação oficial consultada confirmou PUT /v2/empresas/{id}, mas não confirmou GET para este fluxo."); }
export async function registerFocusCompany(): Promise<never> { const adminToken = resolveFocusNfeToken("production").token; if (!adminToken) throw new Error("Token administrativo Focus NFe não configurado para cadastro de empresas."); throw new Error("Cadastro automático de empresas Focus NFe não habilitado neste PR; use o vínculo de empresa já criada."); }
