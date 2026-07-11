import express, {
  Router,
  type IRouter,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  fiscalAuditLogsTable,
  fiscalDocumentsTable,
  fiscalGroupRulesTable,
  fiscalGroupsTable,
  fiscalInutilizationsTable,
  fiscalProviderCredentialsTable,
  storeFiscalPresentationTable,
  storeFiscalSettingsTable,
} from "@workspace/db";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";
import { getFocusNfeConfig, resolveFocusNfeToken } from "../integrations/focus-nfe";
import {
  configureFocusCsc,
  getFocusCompanySummary,
  linkExistingFocusCompany,
  registerFocusCompany,
  uploadFocusCertificate,
} from "../integrations/focus-nfe/company-service";
import { parseCertificateMultipartRequest } from "../integrations/focus-nfe/certificate-upload";
import {
  CERTIFICATE_VALIDATION_ERROR,
  FocusSetupError,
  mapFocusSetupError,
} from "../integrations/focus-nfe/setup-errors";
import { encryptSecret, decryptSecret, encryptionKeyFromEnv } from "../lib/fiscal-secrets";

const router: IRouter = Router();
const clean = (value: unknown, maxLength = 250): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const FOCUS_STATUS_CHECK_FAILED = "FOCUS_STATUS_CHECK_FAILED";
const safeStatusMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (
    /sql|select|insert|update|delete|token|secret|senha|password|certificate|csc|stack/i.test(
      raw,
    )
  )
    return "status_summary_unavailable";
  return raw.slice(0, 160) || "status_summary_unavailable";
};

type ReadinessCheckStatus = "ok" | "warning" | "error" | "pending";

type ReadinessCheck = {
  code: string;
  label: string;
  status: ReadinessCheckStatus;
  message: string;
  blocking?: boolean;
};

type GoLiveCheckStatus = "ok" | "warning" | "blocked" | "pending" | "error";
type GoLiveCheck = { code: string; label: string; status: GoLiveCheckStatus; message: string };
const goLiveSummaryKeys = ["fiscalConfig","focus","certificate","csc","homologation","production","simpleOrder","multisabor","deliveryFee","externalPayments","cancellation","inutilization","secrets"] as const;
type GoLiveSummaryKey = (typeof goLiveSummaryKeys)[number];
const goLiveStatusRank: Record<GoLiveCheckStatus, number> = { ok: 0, warning: 1, pending: 2, blocked: 3, error: 4 };
const foldGoLiveStatus = (...statuses: GoLiveCheckStatus[]): GoLiveCheckStatus => statuses.reduce((worst, status) => goLiveStatusRank[status] > goLiveStatusRank[worst] ? status : worst, "ok" as GoLiveCheckStatus);
const check = (code: string, label: string, status: GoLiveCheckStatus, message: string): GoLiveCheck => ({ code, label, status, message });


const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const daysUntil = (value: Date | string | null | undefined): number | null => {
  const iso = toIso(value);
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
};

const readinessFailureBody = () => ({
  code: "FISCAL_READINESS_CHECK_FAILED",
  error: "Não foi possível carregar o checklist fiscal agora.",
  readyForHomologation: false,
  readyForProduction: false,
  blockingIssues: ["fiscal_readiness_unavailable"],
  warnings: [],
});

function focusStatusFailureBody(
  environment: "homologation" | "production" = "homologation",
) {
  return {
    code: FOCUS_STATUS_CHECK_FAILED,
    error: "Não foi possível carregar o status da integração Focus.",
    diagnosticStage: "focus_status_summary",
    provider: "focus_nfe",
    environment,
    baseIntegrationConfigured: false,
    companyLinked: false,
    homologationCredentialConfigured: false,
    productionCredentialConfigured: false,
    certificateConfigured: false,
    certificateStatus: null,
    certificateExpiresAt: null,
    cscConfigured: false,
    setupStatus: "not_configured",
    readyForHomologationTest: false,
    readyForHomologation: false,
    readyForProduction: false,
    missingRequirements: ["focus_status_unavailable"],
  };
}

function sendSetupError(
  res: { status(code: number): { json(body: unknown): void } },
  error: unknown,
): void {
  const mapped = mapFocusSetupError(error);
  res.status(mapped.status).json(mapped.body);
}


type SystemPreflightStatus = "ok" | "warning" | "blocked" | "error";
type SystemPreflightCheck = { code: string; status: SystemPreflightStatus; message: string };
const preflightCheck = (code: string, status: SystemPreflightStatus, message: string): SystemPreflightCheck => ({ code, status, message });
const hasBlockingPreflightStatus = (status: SystemPreflightStatus) => status === "blocked" || status === "error";
const fiscalTables = [
  ["store_fiscal_settings", storeFiscalSettingsTable],
  ["fiscal_provider_credentials", fiscalProviderCredentialsTable],
  ["fiscal_documents", fiscalDocumentsTable],
  ["fiscal_inutilizations", fiscalInutilizationsTable],
  ["fiscal_groups", fiscalGroupsTable],
  ["fiscal_group_rules", fiscalGroupRulesTable],
] as const;

async function buildSystemPreflight(storeId: number, fiscalFeatureAllowed: boolean) {
  const checks: SystemPreflightCheck[] = [];
  checks.push(preflightCheck("DATABASE_URL_CONFIGURED", process.env.DATABASE_URL ? "ok" : "blocked", process.env.DATABASE_URL ? "DATABASE_URL aparentemente configurada." : "DATABASE_URL não configurada no servidor."));
  try {
    encryptionKeyFromEnv();
    checks.push(preflightCheck("FISCAL_SECRET_KEY_READY", "ok", "Chave de criptografia fiscal configurada."));
    const fake = "fake-fiscal-preflight-secret";
    const encrypted = encryptSecret(fake);
    const decrypted = decryptSecret(encrypted);
    checks.push(preflightCheck("FISCAL_SECRET_ROUNDTRIP", decrypted === fake ? "ok" : "blocked", decrypted === fake ? "Criptografia fiscal validada em memória." : "Criptografia fiscal não concluiu roundtrip em memória."));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chave de criptografia fiscal indisponível.";
    checks.push(preflightCheck("FISCAL_SECRET_KEY_READY", "blocked", message));
    checks.push(preflightCheck("FISCAL_SECRET_ROUNDTRIP", "blocked", "Criptografia fiscal não pôde ser validada em memória."));
  }
  for (const [tableName, table] of fiscalTables) {
    try {
      await db.select({ ok: sql<number>`1` }).from(table).limit(1);
      checks.push(preflightCheck(`FISCAL_TABLE_${tableName.toUpperCase()}_ACCESSIBLE`, "ok", `Tabela fiscal ${tableName} acessível.`));
    } catch {
      checks.push(preflightCheck(`FISCAL_TABLE_${tableName.toUpperCase()}_ACCESSIBLE`, "blocked", `Tabela fiscal ${tableName} indisponível.`));
    }
  }
  const tableBlocked = checks.some((c) => c.code.startsWith("FISCAL_TABLE_") && hasBlockingPreflightStatus(c.status));
  checks.push(preflightCheck("FISCAL_MIGRATIONS_APPLIED", tableBlocked ? "blocked" : "ok", tableBlocked ? "Migrations fiscais não parecem aplicadas." : "Migrations fiscais parecem aplicadas."));
  try {
    const [settings] = await db.select({ id: storeFiscalSettingsTable.id }).from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId, storeId)).limit(1);
    checks.push(preflightCheck("STORE_FISCAL_SETTINGS_QUERY", "ok", settings ? "Configuração fiscal da loja consultada." : "Configuração fiscal da loja ainda não criada."));
  } catch {
    checks.push(preflightCheck("STORE_FISCAL_SETTINGS_QUERY", "blocked", "Backend não conseguiu consultar configuração fiscal da loja."));
  }
  checks.push(preflightCheck("FISCAL_FEATURE_ACTIVE", fiscalFeatureAllowed ? "ok" : "blocked", fiscalFeatureAllowed ? "Módulo fiscal ativo para a loja." : "Módulo fiscal inativo para a loja."));
  const cfg = getFocusNfeConfig();
  checks.push(preflightCheck("FOCUS_BASE_CONFIG_RESOLVED", cfg.baseUrls.homologation && cfg.baseUrls.production ? "ok" : "blocked", "Configuração base da Focus resolvida sem retornar tokens."));
  const focus = await getFocusCompanySummary(storeId);
  checks.push(preflightCheck("STORE_FOCUS_HOMOLOGATION_CREDENTIAL", focus.homologationCredentialConfigured ? "ok" : "warning", focus.homologationCredentialConfigured ? "Credencial Focus de homologação da loja configurada." : "Credencial Focus de homologação da loja pendente."));
  const blockingIssues = checks.filter((c) => hasBlockingPreflightStatus(c.status)).map((c) => c.code);
  const warnings = checks.filter((c) => c.status === "warning").map((c) => c.code);
  return { ready: blockingIssues.length === 0, checks, blockingIssues, warnings };
}

const certificateUploadLimitErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  const name = error instanceof Error ? error.name : "";
  const type =
    typeof (error as { type?: unknown })?.type === "string"
      ? (error as { type: string }).type
      : "";
  if (type === "entity.too.large" || name === "PayloadTooLargeError") {
    res.status(413).json({
      code: CERTIFICATE_VALIDATION_ERROR,
      error: "O arquivo enviado excede o limite permitido.",
    });
    return;
  }
  if (error instanceof SyntaxError || type.includes("multipart")) {
    sendSetupError(
      res,
      new FocusSetupError(
        CERTIFICATE_VALIDATION_ERROR,
        "Upload multipart inválido.",
      ),
    );
    return;
  }
  next(error);
};



router.get(
  "/fiscal/system-preflight",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    const access = res.locals.storeFeatureAccess as { allowed?: boolean } | undefined;
    try {
      res.json(await buildSystemPreflight(actor.storeId, Boolean(access?.allowed)));
    } catch (error) {
      console.error("[fiscal/system-preflight]", { errorName: error instanceof Error ? error.name : typeof error, safeMessage: safeStatusMessage(error), storeId: actor.storeId, userId: actor.id });
      res.status(503).json({ ready: false, checks: [preflightCheck("FISCAL_PREFLIGHT_UNAVAILABLE", "error", "Não foi possível executar o preflight fiscal agora.")], blockingIssues: ["FISCAL_PREFLIGHT_UNAVAILABLE"], warnings: [] });
    }
  },
);

router.post(
  "/fiscal/production/release",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.confirmation !== "LIBERAR PRODUCAO FISCAL") {
      res.status(400).json({ code: "FISCAL_PRODUCTION_RELEASE_CONFIRMATION_INVALID", error: "Produção fiscal ainda não pode ser liberada. Conclua a homologação e os requisitos obrigatórios." });
      return;
    }
    try {
      const [settings] = await db.select().from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId, actor.storeId)).limit(1);
      const focus = await getFocusCompanySummary(actor.storeId);
      const [authorizedHomologation] = await db.select({ id: fiscalDocumentsTable.id }).from(fiscalDocumentsTable).where(and(eq(fiscalDocumentsTable.storeId, actor.storeId), eq(fiscalDocumentsTable.documentType, "nfce"), eq(fiscalDocumentsTable.environment, "homologation"), eq(fiscalDocumentsTable.status, "authorized"))).limit(1);
      const [lastDocument] = await db.select({ status: fiscalDocumentsTable.status }).from(fiscalDocumentsTable).where(eq(fiscalDocumentsTable.storeId, actor.storeId)).orderBy(desc(fiscalDocumentsTable.createdAt)).limit(1);
      const fiscalConfigComplete = Boolean(settings?.cnpj?.trim() && settings?.stateRegistration?.trim() && settings?.taxRegime && settings?.state && settings?.cityIbgeCode && Number.isInteger(settings?.series) && Number.isInteger(settings?.nextNumber));
      const lastCritical = Boolean(lastDocument && ["rejected", "error"].includes(lastDocument.status));
      const allowed = fiscalConfigComplete && focus.homologationCredentialConfigured && focus.productionCredentialConfigured && focus.certificateConfigured && focus.cscConfigured && Boolean(authorizedHomologation) && !lastCritical;
      if (!allowed) {
        res.status(409).json({ code: "FISCAL_PRODUCTION_RELEASE_BLOCKED", error: "Produção fiscal ainda não pode ser liberada. Conclua a homologação e os requisitos obrigatórios." });
        return;
      }
      await db.transaction(async (tx: any) => {
        await tx.update(storeFiscalSettingsTable).set({ setupStatus: "production", updatedAt: new Date() }).where(eq(storeFiscalSettingsTable.storeId, actor.storeId));
        await tx.insert(fiscalAuditLogsTable).values({ storeId: actor.storeId, actorUserId: actor.id, action: "fiscal_production_released", targetType: "store_fiscal_settings", targetId: String(actor.storeId), metadata: { status: "production" } });
      });
      res.json({ ready: true, setupStatus: "production", message: "Produção fiscal liberada com segurança para esta loja." });
    } catch (error) {
      console.error("[fiscal/production/release]", { errorName: error instanceof Error ? error.name : typeof error, safeMessage: safeStatusMessage(error), storeId: actor.storeId, userId: actor.id });
      res.status(503).json({ code: "FISCAL_PRODUCTION_RELEASE_FAILED", error: "Produção fiscal ainda não pode ser liberada. Conclua a homologação e os requisitos obrigatórios." });
    }
  },
);

router.get(
  "/fiscal/go-live-checklist",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    const access = res.locals.storeFeatureAccess as
      | { allowed?: boolean; plan?: string | null; status?: string | null }
      | undefined;
    try {
      const [settings] = await db
        .select()
        .from(storeFiscalSettingsTable)
        .where(eq(storeFiscalSettingsTable.storeId, actor.storeId))
        .limit(1);
      const [authorizedHomologation] = await db
        .select({ id: fiscalDocumentsTable.id })
        .from(fiscalDocumentsTable)
        .where(and(eq(fiscalDocumentsTable.storeId, actor.storeId), eq(fiscalDocumentsTable.documentType, "nfce"), eq(fiscalDocumentsTable.environment, "homologation"), eq(fiscalDocumentsTable.status, "authorized")))
        .orderBy(desc(fiscalDocumentsTable.authorizedAt))
        .limit(1);
      const focus = await getFocusCompanySummary(actor.storeId);
      const environment = settings?.environment === "production" ? "production" : "homologation";
      const baseToken = resolveFocusNfeToken(environment);
      const globalTokenDiagnostic = Boolean(baseToken.token);
      const fiscalConfigReady = Boolean(settings?.cnpj?.trim() && settings?.stateRegistration?.trim() && Number.isInteger(settings?.series) && Number.isInteger(settings?.nextNumber));
      const focusReady = Boolean(focus.companyLinked && focus.homologationCredentialConfigured);
      const certificateReady = Boolean(focus.certificateConfigured);
      const cscReady = Boolean(focus.cscConfigured);
      const homologationAuthorized = Boolean(authorizedHomologation);
      const productionReady = Boolean(focus.readyForProduction);
      const checks: GoLiveCheck[] = [
        check("FISCAL_FEATURE_ACTIVE", "Feature fiscal", access?.allowed ? "ok" : "blocked", access?.allowed ? "Feature fiscal ativa para a loja autenticada." : "Feature fiscal indisponível para a loja autenticada."),
        check("FISCAL_CONFIG_READY", "Configuração fiscal", fiscalConfigReady ? "ok" : "pending", fiscalConfigReady ? "Configuração fiscal encontrada." : "Complete CNPJ, IE, série e próxima numeração."),
        check("FOCUS_CONFIG_READY", "Configuração Focus", focusReady ? "ok" : "pending", focusReady ? "Integração Focus configurada por credencial da loja sem expor credenciais." : "Vincule empresa e credencial de homologação Focus por loja."),
        check("FOCUS_GLOBAL_HOMOLOGATION_TOKEN_DIAGNOSTIC", "Token global homologação", globalTokenDiagnostic ? "ok" : "warning", globalTokenDiagnostic ? "Token global de homologação presente apenas como diagnóstico." : "Token global FOCUS_NFE_HOMOLOGATION_TOKEN ausente; não bloqueia loja com credencial própria."),
        check("CERTIFICATE_READY", "Certificado digital", certificateReady ? "ok" : "pending", certificateReady ? "Certificado configurado; conteúdo e senha não são retornados." : "Envie o certificado A1 para a Focus."),
        check("CSC_READY", "CSC NFC-e", cscReady ? "ok" : "pending", cscReady ? "CSC configurado; segredo não é retornado." : "Configure o CSC/token da NFC-e."),
        check("HOMOLOGATION_AUTHORIZED_DOCUMENT_EXISTS", "NFC-e homologada autorizada", homologationAuthorized ? "ok" : "warning", homologationAuthorized ? "Existe NFC-e de homologação autorizada." : "Validação automática indisponível; execute teste manual."),
        check("PRODUCTION_READY_OR_BLOCKED_SAFELY", "Produção", productionReady ? "ok" : "blocked", productionReady ? "Produção liberada pela prontidão atual." : "Produção bloqueada com segurança até liberação assistida."),
        check("SIMPLE_ORDER_PAYLOAD_READY", "Pedido simples", "ok", "Contrato de payload NFC-e para produto simples coberto por testes."),
        check("MULTISABOR_PAYLOAD_READY", "Multisabor", "ok", "Contrato de payload Multisabor coberto por testes."),
        check("DELIVERY_FEE_PAYLOAD_READY", "Taxa de entrega", "ok", "Taxa de entrega mapeada como item fiscal separado."),
        check("EXTERNAL_PAYMENT_PAYLOAD_READY", "Pagamentos externos", "ok", "Pagamentos externos/marketplace possuem mapeamento fiscal seguro."),
        check("CANCELLATION_AVAILABLE", "Cancelamento", "ok", "Endpoint seguro de cancelamento NFC-e disponível."),
        check("INUTILIZATION_AVAILABLE", "Inutilização", "ok", "Endpoint seguro de inutilização NFC-e disponível."),
        check("SECRETS_NOT_EXPOSED", "Secrets", "ok", "Tokens, CSC, certificado, senha e payload fiscal completo não são retornados."),
        check("STORE_SCOPE_ENFORCED", "Escopo da loja", "ok", "Checklist usa actor.storeId e não aceita storeId do frontend."),
      ];
      const summary: Record<GoLiveSummaryKey, GoLiveCheckStatus> = {
        fiscalConfig: checks.find((c) => c.code === "FISCAL_CONFIG_READY")!.status,
        focus: checks.find((c) => c.code === "FOCUS_CONFIG_READY")!.status,
        certificate: checks.find((c) => c.code === "CERTIFICATE_READY")!.status,
        csc: checks.find((c) => c.code === "CSC_READY")!.status,
        homologation: checks.find((c) => c.code === "HOMOLOGATION_AUTHORIZED_DOCUMENT_EXISTS")!.status,
        production: checks.find((c) => c.code === "PRODUCTION_READY_OR_BLOCKED_SAFELY")!.status,
        simpleOrder: "ok",
        multisabor: "ok",
        deliveryFee: "ok",
        externalPayments: "ok",
        cancellation: "ok",
        inutilization: "ok",
        secrets: foldGoLiveStatus(checks.find((c) => c.code === "SECRETS_NOT_EXPOSED")!.status, checks.find((c) => c.code === "STORE_SCOPE_ENFORCED")!.status),
      };
      res.json({
        storeId: actor.storeId,
        readyForControlledHomologation: fiscalConfigReady && focusReady && certificateReady && cscReady,
        readyForProduction: productionReady,
        summary,
        checks,
        blockingIssues: checks.filter((c) => c.status === "blocked" || c.status === "error").map((c) => c.code),
        warnings: checks.filter((c) => c.status === "warning" || c.status === "pending").map((c) => c.code),
      });
    } catch (error) {
      console.error("[fiscal/go-live-checklist]", { code: "FISCAL_GO_LIVE_CHECKLIST_FAILED", errorName: error instanceof Error ? error.name : typeof error, safeMessage: safeStatusMessage(error), storeId: actor.storeId, userId: actor.id });
      res.status(503).json({ code: "FISCAL_GO_LIVE_CHECKLIST_FAILED", error: "Não foi possível carregar o checklist Go-Live Fiscal agora.", readyForControlledHomologation: false, readyForProduction: false, summary: {}, checks: [], blockingIssues: ["fiscal_go_live_unavailable"], warnings: [] });
    }
  },
);

router.get(
  "/fiscal/focus/readiness",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    const access = res.locals.storeFeatureAccess as
      | { allowed?: boolean; plan?: string | null; status?: string | null }
      | undefined;
    try {
      const [settings] = await db
        .select()
        .from(storeFiscalSettingsTable)
        .where(eq(storeFiscalSettingsTable.storeId, actor.storeId))
        .limit(1);
      const [lastDocument] = await db
        .select({
          id: fiscalDocumentsTable.id,
          status: fiscalDocumentsTable.status,
          environment: fiscalDocumentsTable.environment,
          createdAt: fiscalDocumentsTable.createdAt,
          rejectionMessage: fiscalDocumentsTable.rejectionMessage,
        })
        .from(fiscalDocumentsTable)
        .where(eq(fiscalDocumentsTable.storeId, actor.storeId))
        .orderBy(desc(fiscalDocumentsTable.createdAt))
        .limit(1);

      const environment =
        settings?.environment === "production" ? "production" : "homologation";
      const focus = await getFocusCompanySummary(actor.storeId);
      const baseToken = resolveFocusNfeToken(environment);
      const certificateDaysToExpire = daysUntil(settings?.certificateExpiresAt);
      const certificateConfigured = Boolean(focus.certificateConfigured);
      const certificateExpired =
        certificateConfigured &&
        certificateDaysToExpire !== null &&
        certificateDaysToExpire < 0;
      const certificateExpiringSoon =
        certificateConfigured &&
        certificateDaysToExpire !== null &&
        certificateDaysToExpire >= 0 &&
        certificateDaysToExpire < 30;
      const fiscalConfigConfigured = Boolean(settings);
      const cnpjConfigured = Boolean(settings?.cnpj?.trim());
      const stateRegistrationConfigured = Boolean(
        settings?.stateRegistration?.trim(),
      );
      const serieConfigured = Number.isInteger(settings?.series);
      const nextNumberConfigured = Number.isInteger(settings?.nextNumber);
      const [authorizedHomologation] = await db
        .select({ id: fiscalDocumentsTable.id })
        .from(fiscalDocumentsTable)
        .where(and(eq(fiscalDocumentsTable.storeId, actor.storeId), eq(fiscalDocumentsTable.documentType, "nfce"), eq(fiscalDocumentsTable.environment, "homologation"), eq(fiscalDocumentsTable.status, "authorized")))
        .orderBy(desc(fiscalDocumentsTable.authorizedAt))
        .limit(1);
      const homTestDone = Boolean(authorizedHomologation);
      const productionReleaseEnabled = focus.setupStatus === "production";
      const lastRejectedOrErrored = Boolean(
        lastDocument && ["rejected", "error"].includes(lastDocument.status),
      );
      const checks: ReadinessCheck[] = [
        {
          code: "PLAN_PRO_ACTIVE",
          label: "Plano PRO ativo",
          status: access?.allowed ? "ok" : "error",
          message: access?.allowed
            ? "A loja possui acesso ao módulo fiscal."
            : "Ative o plano PRO para liberar o módulo fiscal.",
          blocking: !access?.allowed,
        },
        {
          code: "FISCAL_CONFIG_EXISTS",
          label: "Configuração fiscal criada",
          status: fiscalConfigConfigured ? "ok" : "error",
          message: fiscalConfigConfigured
            ? "A loja possui configuração fiscal."
            : "Preencha a configuração fiscal da loja.",
          blocking: !fiscalConfigConfigured,
        },
        {
          code: "CNPJ_CONFIGURED",
          label: "CNPJ configurado",
          status: cnpjConfigured ? "ok" : "error",
          message: cnpjConfigured
            ? "CNPJ fiscal informado."
            : "Informe o CNPJ da loja.",
          blocking: !cnpjConfigured,
        },
        {
          code: "STATE_REGISTRATION_CONFIGURED",
          label: "Inscrição estadual configurada",
          status: stateRegistrationConfigured ? "ok" : "error",
          message: stateRegistrationConfigured
            ? "Inscrição estadual informada."
            : "Informe a inscrição estadual da loja.",
          blocking: !stateRegistrationConfigured,
        },
        {
          code: "FOCUS_TOKEN_CONFIGURED",
          label: "Token Focus NFe homologação configurado",
          status: focus.homologationCredentialConfigured ? "ok" : "error",
          message: focus.homologationCredentialConfigured
            ? "Token de homologação configurado."
            : "Configure o token de homologação da Focus NFe.",
          blocking: !focus.homologationCredentialConfigured,
        },
        {
          code: "FOCUS_COMPANY_LINKED",
          label: "Empresa Focus vinculada",
          status: focus.companyLinked ? "ok" : "error",
          message: focus.companyLinked
            ? "Empresa vinculada à Focus NFe."
            : "Vincule a empresa criada na Focus NFe.",
          blocking: !focus.companyLinked,
        },
        {
          code: "CERTIFICATE_CONFIGURED",
          label: "Certificado digital enviado",
          status: certificateConfigured ? "ok" : "error",
          message: certificateConfigured
            ? "Certificado A1 enviado à Focus."
            : "Envie o certificado digital A1.",
          blocking: !certificateConfigured,
        },
        {
          code: "CERTIFICATE_NOT_EXPIRED",
          label: "Certificado dentro da validade",
          status: !certificateConfigured
            ? "pending"
            : certificateExpired
              ? "error"
              : certificateExpiringSoon
                ? "warning"
                : "ok",
          message: !certificateConfigured
            ? "Envie o certificado para validar a data de vencimento."
            : certificateExpired
              ? "O certificado digital está vencido."
              : certificateExpiringSoon
                ? `O certificado vence em ${certificateDaysToExpire} dias.`
                : "Certificado sem vencimento crítico conhecido.",
          blocking: certificateExpired,
        },
        {
          code: "CSC_CONFIGURED",
          label: "CSC/token configurado",
          status: focus.cscConfigured ? "ok" : "error",
          message: focus.cscConfigured
            ? "CSC de homologação configurado."
            : "Configure o CSC/token da NFC-e.",
          blocking: !focus.cscConfigured,
        },
        {
          code: "HOMOLOGATION_TEST_DONE",
          label: "Homologação testada",
          status: homTestDone ? "ok" : "pending",
          message: homTestDone
            ? "Já existe NFC-e de homologação autorizada."
            : "Emita e autorize uma NFC-e em homologação antes da implantação real.",
        },
        {
          code: "LAST_DOCUMENT_NOT_REJECTED",
          label: "Último documento sem rejeição crítica",
          status: lastRejectedOrErrored ? "warning" : "ok",
          message: lastRejectedOrErrored
            ? "O último documento fiscal precisa de revisão antes de avançar."
            : "Nenhuma rejeição crítica recente encontrada.",
        },
        {
          code: "PRODUCTION_TOKEN_CONFIGURED",
          label: "Token Focus produção configurado",
          status: focus.productionCredentialConfigured ? "ok" : "error",
          message: focus.productionCredentialConfigured ? "Token de produção configurado." : "Configure o token de produção da Focus NFe.",
          blocking: !focus.productionCredentialConfigured,
        },
        {
          code: "PRODUCTION_ADMIN_RELEASE",
          label: "Liberação administrativa de produção",
          status: productionReleaseEnabled ? "ok" : "pending",
          message: productionReleaseEnabled ? "Loja explicitamente liberada para produção fiscal." : "Produção depende de liberação administrativa em etapa futura.",
          blocking: !productionReleaseEnabled,
        },
      ];
      const basicCodes = new Set([
        "PLAN_PRO_ACTIVE",
        "FISCAL_CONFIG_EXISTS",
        "CNPJ_CONFIGURED",
        "STATE_REGISTRATION_CONFIGURED",
        "FOCUS_TOKEN_CONFIGURED",
        "FOCUS_COMPANY_LINKED",
        "CERTIFICATE_CONFIGURED",
        "CERTIFICATE_NOT_EXPIRED",
        "CSC_CONFIGURED",
      ]);
      const readyForHomologation = checks
        .filter((check) => basicCodes.has(check.code))
        .every((check) => check.status === "ok" || check.status === "warning");
      res.json({
        storeId: actor.storeId,
        plan: {
          required: "pro",
          allowed: Boolean(access?.allowed),
          status: access?.status ?? null,
        },
        focus: {
          configured: Boolean(focus.homologationCredentialConfigured && focus.companyLinked),
          tokenConfigured: focus.homologationCredentialConfigured,
          companyLinked: focus.companyLinked,
          companyId: focus.providerCompanyId,
          environment,
        },
        certificate: {
          configured: certificateConfigured,
          expiresAt: toIso(settings?.certificateExpiresAt),
          daysToExpire: certificateDaysToExpire,
          status: certificateExpired
            ? "expired"
            : certificateExpiringSoon
              ? "expiring_soon"
              : focus.certificateStatus,
        },
        csc: { configured: focus.cscConfigured },
        fiscalConfig: {
          configured: fiscalConfigConfigured,
          cnpjConfigured,
          stateRegistrationConfigured,
          serieConfigured,
          nextNumberConfigured,
        },
        lastDocument: lastDocument
          ? {
              id: lastDocument.id,
              status: lastDocument.status,
              environment: lastDocument.environment,
              createdAt: toIso(lastDocument.createdAt),
              errorMessage: lastRejectedOrErrored
                ? (lastDocument.rejectionMessage ??
                  "Documento fiscal rejeitado.")
                : null,
            }
          : null,
        checks,
        readyForHomologation,
        productionReleaseEnabled,
        readyForProduction: focus.readyForProduction,
        blockingIssues: checks
          .filter((check) => check.blocking || check.status === "error")
          .map((check) => check.code),
        warnings: checks
          .filter((check) => check.status === "warning")
          .map((check) => check.code),
      });
    } catch (error) {
      console.error("[fiscal/focus/readiness]", {
        code: "FISCAL_READINESS_CHECK_FAILED",
        errorName: error instanceof Error ? error.name : typeof error,
        safeMessage: safeStatusMessage(error),
        storeId: actor.storeId,
        userId: actor.id,
      });
      res.status(503).json(readinessFailureBody());
    }
  },
);

router.get(
  "/fiscal/focus/status",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    let environment: "homologation" | "production" = "homologation";
    try {
      const [settings] = await db
        .select()
        .from(storeFiscalSettingsTable)
        .where(eq(storeFiscalSettingsTable.storeId, actor.storeId))
        .limit(1);
      environment =
        settings?.environment === "production" ? "production" : "homologation";
      const baseToken = resolveFocusNfeToken(environment);
      const company = await getFocusCompanySummary(actor.storeId);
      res.json({
        provider: settings?.provider ?? "focus_nfe",
        environment,
        baseIntegrationConfigured: Boolean(baseToken.token),
        companyLinked: company.companyLinked,
        homologationCredentialConfigured:
          company.homologationCredentialConfigured,
        productionCredentialConfigured: company.productionCredentialConfigured,
        certificateConfigured: company.certificateConfigured,
        certificateStatus: company.certificateStatus,
        certificateExpiresAt: company.certificateExpiresAt,
        cscConfigured: company.cscConfigured,
        setupStatus: company.setupStatus,
        readyForHomologationTest: company.readyForHomologationTest,
        readyForHomologation: company.readyForHomologation,
        readyForProduction: company.readyForProduction,
        missingRequirements: company.missingRequirements,
      });
    } catch (error) {
      console.error("[fiscal/focus/status]", {
        code: FOCUS_STATUS_CHECK_FAILED,
        diagnosticStage: "focus_status_summary",
        errorName: error instanceof Error ? error.name : typeof error,
        safeMessage: safeStatusMessage(error),
        storeId: actor.storeId,
        userId: actor.id,
      });
      res.status(503).json(focusStatusFailureBody(environment));
    }
  },
);

router.get(
  "/fiscal/focus/status/debug",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    try {
      const [settings] = await db
        .select({ id: storeFiscalSettingsTable.id })
        .from(storeFiscalSettingsTable)
        .where(eq(storeFiscalSettingsTable.storeId, actor.storeId))
        .limit(1);
      const [presentation] = await db
        .select({ mode: storeFiscalPresentationTable.mode })
        .from(storeFiscalPresentationTable)
        .where(eq(storeFiscalPresentationTable.storeId, actor.storeId))
        .limit(1);
      const summary = await getFocusCompanySummary(actor.storeId);
      res.json({
        storeId: actor.storeId,
        hasSettings: Boolean(settings),
        hasStoreFiscalPresentation: Boolean(presentation),
        detectedMode:
          presentation?.mode === "complete" ? "complete" : "simplified",
        credentialStatusStage: summary.credentialStatusStage,
        rulesStatusStage: summary.rulesStatusStage,
        summaryStatus: "ok",
        missingRequirements: summary.missingRequirements,
      });
    } catch {
      res.status(503).json({
        storeId: actor.storeId,
        hasSettings: false,
        hasStoreFiscalPresentation: false,
        detectedMode: "simplified",
        credentialStatusStage: "unknown",
        rulesStatusStage: "unknown",
        summaryStatus: FOCUS_STATUS_CHECK_FAILED,
        missingRequirements: ["focus_status_unavailable"],
      });
    }
  },
);

router.get(
  "/fiscal/focus/company",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req, res) => {
    const actor = await resolveCurrentActor(req);
    res.json(await getFocusCompanySummary(actor.storeId));
  },
);

router.post(
  "/fiscal/focus/company/link",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req, res): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const providerCompanyId = clean(body.providerCompanyId, 120);
    const homologationToken = clean(body.homologationToken, 500);
    const productionToken = clean(body.productionToken, 500);
    if (!providerCompanyId || !homologationToken) {
      res.status(400).json({
        error: "Informe providerCompanyId e token de homologação da Focus NFe.",
      });
      return;
    }
    try {
      res.status(200).json(
        await linkExistingFocusCompany({
          storeId: actor.storeId,
          actorUserId: actor.id,
          providerCompanyId,
          homologationToken,
          productionToken: productionToken || undefined,
        }),
      );
    } catch (error) {
      sendSetupError(res, error);
    }
  },
);

router.post(
  "/fiscal/focus/certificate",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  express.raw({ type: "multipart/form-data", limit: "6mb" }),
  certificateUploadLimitErrorHandler,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    let parsed:
      | Awaited<ReturnType<typeof parseCertificateMultipartRequest>>
      | undefined;
    let serviceBuffer: Buffer | undefined;
    try {
      if (!Buffer.isBuffer(req.body))
        throw new FocusSetupError(
          CERTIFICATE_VALIDATION_ERROR,
          "Upload multipart inválido.",
        );
      parsed = await parseCertificateMultipartRequest(req);
      serviceBuffer = Buffer.from(parsed.content);
      const summary = await uploadFocusCertificate({
        storeId: actor.storeId,
        actorUserId: actor.id,
        filename: parsed.filename,
        content: serviceBuffer,
        password: parsed.password,
      });
      res.status(200).json(summary);
    } catch (error) {
      sendSetupError(
        res,
        error instanceof SyntaxError
          ? new FocusSetupError(
              CERTIFICATE_VALIDATION_ERROR,
              "Upload multipart inválido.",
            )
          : error,
      );
    } finally {
      parsed?.content.fill(0);
      parsed?.multipartBody?.fill(0);
      serviceBuffer?.fill(0);
    }
  },
);

router.put(
  "/fiscal/focus/csc",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req, res): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.status(200).json(
        await configureFocusCsc({
          storeId: actor.storeId,
          actorUserId: actor.id,
          cscId: clean(body.cscId, 20),
          cscSecret: clean(body.cscSecret, 500),
        }),
      );
    } catch (error) {
      sendSetupError(res, error);
    }
  },
);

router.post(
  "/fiscal/focus/company/register",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (_req, res) => {
    try {
      await registerFocusCompany();
    } catch {
      res.status(501).json({
        code: "INTERNAL_ERROR",
        error: "Cadastro automático indisponível.",
      });
    }
  },
);
export default router;
