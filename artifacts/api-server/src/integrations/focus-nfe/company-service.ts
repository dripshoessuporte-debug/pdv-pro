import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  fiscalAuditLogsTable,
  fiscalGroupRulesTable,
  fiscalGroupsTable,
  productFiscalSettingsTable,
  productsTable,
  storeFiscalSettingsTable,
} from "@workspace/db";
import { FocusNfeClient } from "./client";
import { FocusNfeError } from "./errors";
import {
  CERTIFICATE_VALIDATION_ERROR,
  COMPANY_NOT_LINKED,
  CSC_VALIDATION_ERROR,
  FOCUS_APPLIED_LOCAL_SYNC_FAILED,
  FOCUS_AUTHENTICATION_ERROR,
  FOCUS_TIMEOUT,
  FOCUS_UNAVAILABLE,
  FOCUS_VALIDATION_ERROR,
  FocusSetupError,
  STORE_CREDENTIAL_NOT_CONFIGURED,
} from "./setup-errors";
export { getHomologationRuleMode, isFiscalRuleComplete } from "./readiness";
import { getHomologationRuleMode } from "./readiness";
import { resolveFocusNfeToken } from "./config";
import type { FocusNfeEnvironment, FocusNfeStoreContext } from "./types";
import {
  getStoreFiscalCredential,
  hasStoreFiscalCredential,
  saveStoreFiscalCredential,
} from "../../lib/fiscal-secrets";

export type LinkFocusCompanyInput = {
  storeId: number;
  actorUserId?: number | null;
  providerCompanyId: string;
  homologationToken: string;
  productionToken?: string;
};

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

type FocusCompanyUpdateResponse = Record<string, unknown>;

export async function resolveStoreFocusCredentials(params: {
  storeId: number;
  environment: FocusNfeEnvironment;
}): Promise<FocusNfeStoreContext> {
  const token = await getStoreFiscalCredential({
    storeId: params.storeId,
    provider: "focus_nfe",
    environment: params.environment,
    credentialType: "api_token",
  });
  if (!token)
    throw new FocusSetupError(
      STORE_CREDENTIAL_NOT_CONFIGURED,
      "Credencial Focus NFe da loja não configurada para o ambiente fiscal.",
    );
  const [settings] = await db
    .select({ providerCompanyId: storeFiscalSettingsTable.providerCompanyId })
    .from(storeFiscalSettingsTable)
    .where(eq(storeFiscalSettingsTable.storeId, params.storeId))
    .limit(1);
  return {
    storeId: params.storeId,
    environment: params.environment,
    credentials: { token, tokenReference: "fiscal_provider_credentials" },
    providerCompanyId: settings?.providerCompanyId ?? null,
  };
}

export async function getFocusCompanySummary(storeId: number) {
  const [settings] = await db
    .select()
    .from(storeFiscalSettingsTable)
    .where(eq(storeFiscalSettingsTable.storeId, storeId))
    .limit(1);
  const homologationCredentialConfigured = await hasStoreFiscalCredential({
    storeId,
    provider: "focus_nfe",
    environment: "homologation",
    credentialType: "api_token",
  });
  const productionCredentialConfigured = await hasStoreFiscalCredential({
    storeId,
    provider: "focus_nfe",
    environment: "production",
    credentialType: "api_token",
  });
  // O próximo backend fiscal marcará o certificado como valid após uma NFC-e de homologação autorizada,
  // comprovando que certificado, CSC e comunicação com a Focus funcionam em conjunto.
  const certificateStatus = settings?.certificateStatus ?? null;
  const certificateSubmittedOrValid = Boolean(
    settings?.certificateReference &&
    (certificateStatus === "submitted" || certificateStatus === "valid"),
  );
  const certificateConfigured = certificateSubmittedOrValid;
  const certificateValid = Boolean(
    settings?.certificateReference && certificateStatus === "valid",
  );
  const cscConfigured = Boolean(
    settings?.cscId && settings?.cscSecretReference,
  );
  const missingRequirements = await getHomologationMissingRequirements(
    storeId,
    settings,
    homologationCredentialConfigured,
    certificateSubmittedOrValid,
    cscConfigured,
  );
  const readyForHomologationTest = missingRequirements.length === 0;
  const readyForHomologation = readyForHomologationTest && certificateValid;
  return {
    provider: settings?.provider ?? "focus_nfe",
    environment:
      settings?.environment === "production" ? "production" : "homologation",
    companyLinked: Boolean(settings?.providerCompanyId),
    providerCompanyId: settings?.providerCompanyId ?? null,
    homologationCredentialConfigured,
    productionCredentialConfigured,
    certificateConfigured,
    certificateStatus,
    certificateExpiresAt: settings?.certificateExpiresAt ?? null,
    cscConfigured,
    cscIdConfigured: Boolean(settings?.cscId),
    setupStatus: settings?.setupStatus ?? "not_configured",
    readyForHomologationTest,
    readyForHomologation,
    readyForProduction: false,
    missingRequirements,
  };
}

export async function linkExistingFocusCompany(input: LinkFocusCompanyInput) {
  await db.transaction(async (tx: DbExecutor) => {
    const homologationStatus = await saveStoreFiscalCredential({
      storeId: input.storeId,
      provider: "focus_nfe",
      environment: "homologation",
      credentialType: "api_token",
      value: input.homologationToken,
      executor: tx,
    });
    let productionStatus: "created" | "replaced" | null = null;
    if (input.productionToken)
      productionStatus = await saveStoreFiscalCredential({
        storeId: input.storeId,
        provider: "focus_nfe",
        environment: "production",
        credentialType: "api_token",
        value: input.productionToken,
        executor: tx,
      });
    await tx
      .insert(storeFiscalSettingsTable)
      .values({
        storeId: input.storeId,
        provider: "focus_nfe",
        environment: "homologation",
        providerCompanyId: input.providerCompanyId,
        setupStatus: "configuring",
        configuredByUserId: input.actorUserId ?? null,
      })
      .onConflictDoUpdate({
        target: storeFiscalSettingsTable.storeId,
        set: {
          provider: "focus_nfe",
          providerCompanyId: input.providerCompanyId,
          setupStatus: "configuring",
          configuredByUserId: input.actorUserId ?? null,
          updatedAt: new Date(),
        },
      });
    await audit(
      tx,
      input.storeId,
      input.actorUserId,
      "focus_company_linked",
      input.providerCompanyId,
      { status: "linked" },
    );
    await audit(
      tx,
      input.storeId,
      input.actorUserId,
      homologationStatus === "created"
        ? "focus_credential_created"
        : "focus_credential_replaced",
      input.providerCompanyId,
      { environment: "homologation" },
    );
    if (productionStatus)
      await audit(
        tx,
        input.storeId,
        input.actorUserId,
        productionStatus === "created"
          ? "focus_credential_created"
          : "focus_credential_replaced",
        input.providerCompanyId,
        { environment: "production" },
      );
  });
  return getFocusCompanySummary(input.storeId);
}

async function audit(
  executor: DbExecutor,
  storeId: number,
  actorUserId: number | null | undefined,
  action: string,
  providerCompanyId: string,
  metadata: Record<string, unknown>,
) {
  await executor
    .insert(fiscalAuditLogsTable)
    .values({
      storeId,
      actorUserId: actorUserId ?? null,
      action,
      targetType: "focus_company",
      targetId: providerCompanyId,
      metadata: { providerCompanyId, ...metadata },
    });
}

function certMeta(providerCompanyId: string, data: FocusCompanyUpdateResponse) {
  const expiresRaw =
    typeof data.certificado_valido_ate === "string"
      ? data.certificado_valido_ate
      : null;
  return {
    reference: `focus_company:${providerCompanyId}:certificate`,
    status: "submitted",
    expiresAt:
      expiresRaw && !Number.isNaN(Date.parse(expiresRaw))
        ? new Date(expiresRaw)
        : null,
  };
}

export async function uploadFocusCertificate(input: {
  storeId: number;
  actorUserId?: number | null;
  filename: string;
  content: Buffer;
  password: string;
  client?: FocusNfeClient;
}) {
  try {
    validateCertificate(input.filename, input.content, input.password);
    const context = await resolveStoreFocusCredentials({
      storeId: input.storeId,
      environment: "homologation",
    });
    if (!context.providerCompanyId)
      throw new FocusSetupError(
        COMPANY_NOT_LINKED,
        "Empresa Focus NFe ainda não vinculada à loja.",
      );
    const previous = await getFocusCompanySummary(input.storeId);

    let result: { data: FocusCompanyUpdateResponse };
    try {
      result = await (
        input.client ?? new FocusNfeClient()
      ).request<FocusCompanyUpdateResponse>(context, {
        method: "PUT",
        path: `/v2/empresas/${encodeURIComponent(context.providerCompanyId)}`,
        body: {
          arquivo_certificado_base64: input.content.toString("base64"),
          senha_certificado: input.password,
        },
      });
    } catch (error) {
      await audit(
        db,
        input.storeId,
        input.actorUserId,
        "focus_certificate_rejected",
        context.providerCompanyId,
        {
          environment: "homologation",
          status: "rejected",
          errorCode: error instanceof Error ? error.name : "focus_error",
        },
      );
      throw classifyFocusError(
        error,
        "A Focus NFe rejeitou ou não recebeu o certificado. A configuração anterior foi mantida.",
      );
    }

    try {
      const meta = certMeta(context.providerCompanyId, result.data);
      await db.transaction(async (tx: DbExecutor) => {
        await tx
          .insert(storeFiscalSettingsTable)
          .values({
            storeId: input.storeId,
            provider: "focus_nfe",
            environment: "homologation",
            providerCompanyId: context.providerCompanyId,
            certificateReference: meta.reference,
            certificateStatus: meta.status,
            certificateExpiresAt: meta.expiresAt,
            setupStatus: "configuring",
            configuredByUserId: input.actorUserId ?? null,
          })
          .onConflictDoUpdate({
            target: storeFiscalSettingsTable.storeId,
            set: {
              certificateReference: meta.reference,
              certificateStatus: meta.status,
              certificateExpiresAt: meta.expiresAt,
              configuredByUserId: input.actorUserId ?? null,
              updatedAt: new Date(),
            },
          });
        await audit(
          tx,
          input.storeId,
          input.actorUserId,
          "focus_certificate_submitted",
          context.providerCompanyId!,
          {
            environment: "homologation",
            status: meta.status,
            certificateExpiresAt: meta.expiresAt?.toISOString() ?? null,
          },
        );
        if (previous.certificateConfigured)
          await audit(
            tx,
            input.storeId,
            input.actorUserId,
            "focus_certificate_replaced",
            context.providerCompanyId!,
            { environment: "homologation" },
          );
      });
      await markReadyIfComplete(
        input.storeId,
        input.actorUserId,
        context.providerCompanyId,
      );
      return getFocusCompanySummary(input.storeId);
    } catch {
      throw new FocusSetupError(
        FOCUS_APPLIED_LOCAL_SYNC_FAILED,
        "A Focus NFe recebeu a configuração do certificado, mas o Gestor Max não conseguiu sincronizar o estado local.",
      );
    }
  } finally {
    input.content.fill(0);
  }
}

export async function configureFocusCsc(input: {
  storeId: number;
  actorUserId?: number | null;
  cscId: string;
  cscSecret: string;
  client?: FocusNfeClient;
}) {
  const cscId = input.cscId.trim();
  const cscSecret = input.cscSecret.trim();
  if (!/^\d{1,6}$/.test(cscId))
    throw new FocusSetupError(
      CSC_VALIDATION_ERROR,
      "ID do CSC de homologação inválido.",
    );
  if (cscSecret.length < 6 || cscSecret.length > 255)
    throw new FocusSetupError(
      CSC_VALIDATION_ERROR,
      "CSC de homologação inválido.",
    );
  const context = await resolveStoreFocusCredentials({
    storeId: input.storeId,
    environment: "homologation",
  });
  if (!context.providerCompanyId)
    throw new FocusSetupError(
      COMPANY_NOT_LINKED,
      "Empresa Focus NFe ainda não vinculada à loja.",
    );
  const previous = await getFocusCompanySummary(input.storeId);
  try {
    await (input.client ?? new FocusNfeClient()).request(context, {
      method: "PUT",
      path: `/v2/empresas/${encodeURIComponent(context.providerCompanyId)}`,
      body: {
        csc_nfce_homologacao: cscSecret,
        id_token_nfce_homologacao: Number(cscId),
      },
    });
  } catch (error) {
    throw classifyFocusError(
      error,
      "A Focus NFe rejeitou ou não recebeu o CSC de homologação.",
    );
  }
  try {
    await db.transaction(async (tx: DbExecutor) => {
      await audit(
        tx,
        input.storeId,
        input.actorUserId,
        "focus_csc_accepted",
        context.providerCompanyId!,
        { environment: "homologation", status: "accepted" },
      );
      await saveStoreFiscalCredential({
        storeId: input.storeId,
        provider: "focus_nfe",
        environment: "homologation",
        credentialType: "csc_secret",
        value: cscSecret,
        executor: tx,
      });
      await tx
        .insert(storeFiscalSettingsTable)
        .values({
          storeId: input.storeId,
          provider: "focus_nfe",
          environment: "homologation",
          providerCompanyId: context.providerCompanyId,
          cscId,
          cscSecretReference:
            "fiscal_provider_credentials:csc_secret:homologation",
          configuredByUserId: input.actorUserId ?? null,
        })
        .onConflictDoUpdate({
          target: storeFiscalSettingsTable.storeId,
          set: {
            cscId,
            cscSecretReference:
              "fiscal_provider_credentials:csc_secret:homologation",
            configuredByUserId: input.actorUserId ?? null,
            updatedAt: new Date(),
          },
        });
      await audit(
        tx,
        input.storeId,
        input.actorUserId,
        previous.cscConfigured ? "focus_csc_replaced" : "focus_csc_configured",
        context.providerCompanyId!,
        { environment: "homologation", status: "configured" },
      );
    });
    await markReadyIfComplete(
      input.storeId,
      input.actorUserId,
      context.providerCompanyId,
    );
    return getFocusCompanySummary(input.storeId);
  } catch {
    throw new FocusSetupError(
      FOCUS_APPLIED_LOCAL_SYNC_FAILED,
      "A Focus NFe recebeu a configuração do CSC, mas o Gestor Max não conseguiu sincronizar o estado local.",
    );
  }
}

function validateCertificate(
  filename: string,
  content: Buffer,
  password: string,
) {
  if (!/\.(pfx|p12)$/i.test(filename))
    throw new FocusSetupError(
      CERTIFICATE_VALIDATION_ERROR,
      "Envie um certificado A1 .pfx ou .p12.",
    );
  if (content.length === 0)
    throw new FocusSetupError(
      CERTIFICATE_VALIDATION_ERROR,
      "O certificado enviado está vazio.",
    );
  if (content.length > 5 * 1024 * 1024)
    throw new FocusSetupError(
      CERTIFICATE_VALIDATION_ERROR,
      "O certificado deve ter no máximo 5 MB.",
    );
  if (typeof password !== "string" || password.length === 0)
    throw new FocusSetupError(
      CERTIFICATE_VALIDATION_ERROR,
      "Informe a senha do certificado.",
    );
  if (password.length > 500)
    throw new FocusSetupError(
      CERTIFICATE_VALIDATION_ERROR,
      "A senha do certificado deve ter no máximo 500 caracteres.",
    );
}

function classifyFocusError(error: unknown, message: string): FocusSetupError {
  if (error instanceof FocusNfeError) {
    if (error.kind === "authentication")
      return new FocusSetupError(FOCUS_AUTHENTICATION_ERROR, message);
    if (error.kind === "timeout")
      return new FocusSetupError(FOCUS_TIMEOUT, message);
    if (
      error.kind === "communication" ||
      error.kind === "temporary_unavailable"
    )
      return new FocusSetupError(FOCUS_UNAVAILABLE, message);
    if (error.kind === "validation" || error.kind === "unexpected_response")
      return new FocusSetupError(FOCUS_VALIDATION_ERROR, message);
  }
  return new FocusSetupError(FOCUS_UNAVAILABLE, message);
}

export async function getHomologationMissingRequirements(
  storeId: number,
  settings: typeof storeFiscalSettingsTable.$inferSelect | undefined,
  token: boolean,
  cert: boolean,
  csc: boolean,
) {
  const missing: string[] = [];
  if (!settings?.providerCompanyId) missing.push("company_not_linked");
  if (!token) missing.push("homologation_token_missing");
  if (!cert) missing.push("certificate_missing");
  if (!csc) missing.push("csc_missing");
  const companyDataComplete = [
    settings?.cnpj,
    settings?.stateRegistration,
    settings?.taxRegime,
    settings?.state,
    settings?.cityIbgeCode,
  ].every(Boolean);
  if (!companyDataComplete) missing.push("company_data_incomplete");
  if (!settings?.series || !settings?.nextNumber)
    missing.push("numbering_missing");
  if (getHomologationRuleMode(settings) === "complete") {
    const [rule] = await db
      .select({ id: productFiscalSettingsTable.id })
      .from(productFiscalSettingsTable)
      .innerJoin(
        productsTable,
        and(
          eq(productFiscalSettingsTable.productId, productsTable.id),
          eq(productsTable.storeId, storeId),
        ),
      )
      .where(
        and(
          eq(productFiscalSettingsTable.storeId, storeId),
          eq(productFiscalSettingsTable.active, true),
          isNotNull(productFiscalSettingsTable.ncm),
          isNotNull(productFiscalSettingsTable.cfop),
          isNotNull(productFiscalSettingsTable.commercialUnit),
          isNotNull(productFiscalSettingsTable.origin),
          isNotNull(productFiscalSettingsTable.icmsCode),
          isNotNull(productFiscalSettingsTable.pisCode),
          isNotNull(productFiscalSettingsTable.cofinsCode),
        ),
      )
      .limit(1);
    if (!rule) missing.push("complete_product_rules_incomplete");
  } else {
    const [rule] = await db
      .select({ id: fiscalGroupRulesTable.id })
      .from(fiscalGroupRulesTable)
      .innerJoin(
        fiscalGroupsTable,
        eq(fiscalGroupRulesTable.fiscalGroupId, fiscalGroupsTable.id),
      )
      .where(
        and(
          eq(fiscalGroupRulesTable.storeId, storeId),
          eq(fiscalGroupsTable.storeId, storeId),
          eq(fiscalGroupsTable.active, true),
          isNotNull(fiscalGroupRulesTable.ncm),
          isNotNull(fiscalGroupRulesTable.cfop),
          isNotNull(fiscalGroupRulesTable.commercialUnit),
          isNotNull(fiscalGroupRulesTable.origin),
          isNotNull(fiscalGroupRulesTable.icmsCode),
          isNotNull(fiscalGroupRulesTable.pisCode),
          isNotNull(fiscalGroupRulesTable.cofinsCode),
        ),
      )
      .limit(1);
    if (!rule) missing.push("simplified_rules_incomplete");
  }
  return missing;
}

async function markReadyIfComplete(
  storeId: number,
  actorUserId: number | null | undefined,
  providerCompanyId: string | null | undefined,
) {
  const summary = await getFocusCompanySummary(storeId);
  if (summary.readyForHomologation && providerCompanyId)
    await db.transaction(async (tx: DbExecutor) => {
      await tx
        .update(storeFiscalSettingsTable)
        .set({ setupStatus: "homologation", updatedAt: new Date() })
        .where(eq(storeFiscalSettingsTable.storeId, storeId));
      await audit(
        tx,
        storeId,
        actorUserId,
        "focus_setup_ready_for_homologation",
        providerCompanyId,
        { environment: "homologation", status: "ready" },
      );
    });
}

export async function getRegisteredFocusCompany(): Promise<never> {
  throw new Error(
    "Consulta GET /v2/empresas/{id} desabilitada: a documentação oficial consultada confirmou PUT /v2/empresas/{id}, mas não confirmou GET para este fluxo.",
  );
}
export async function registerFocusCompany(): Promise<never> {
  const adminToken = resolveFocusNfeToken("production").token;
  if (!adminToken)
    throw new Error(
      "Token administrativo Focus NFe não configurado para cadastro de empresas.",
    );
  throw new Error(
    "Cadastro automático de empresas Focus NFe não habilitado neste PR; use o vínculo de empresa já criada.",
  );
}
