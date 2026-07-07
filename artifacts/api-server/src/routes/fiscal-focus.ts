import express, {
  Router,
  type IRouter,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  fiscalDocumentsTable,
  storeFiscalPresentationTable,
  storeFiscalSettingsTable,
} from "@workspace/db";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";
import { resolveFocusNfeToken } from "../integrations/focus-nfe";
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
      const homTestDone = Boolean(
        lastDocument &&
        lastDocument.environment === "homologation" &&
        lastDocument.status === "authorized",
      );
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
          label: "Token Focus NFe configurado",
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
          code: "PRODUCTION_ENV_NOT_ENABLED_YET",
          label: "Produção ainda não liberada",
          status: "pending",
          message: "Emissão em produção será liberada em etapa futura.",
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
          configured: Boolean(baseToken.token && focus.companyLinked),
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
        readyForProduction: false,
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
