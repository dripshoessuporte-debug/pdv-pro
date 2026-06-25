import express, { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storeFiscalSettingsTable } from "@workspace/db";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";
import { resolveFocusNfeToken } from "../integrations/focus-nfe";
import { configureFocusCsc, getFocusCompanySummary, linkExistingFocusCompany, registerFocusCompany, uploadFocusCertificate } from "../integrations/focus-nfe/company-service";
import { parseCertificateMultipartRequest } from "../integrations/focus-nfe/certificate-upload";
import { CERTIFICATE_VALIDATION_ERROR, FocusSetupError, mapFocusSetupError } from "../integrations/focus-nfe/setup-errors";

const router: IRouter = Router();
const clean = (value: unknown, maxLength = 250): string => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

function sendSetupError(res: { status(code: number): { json(body: unknown): void } }, error: unknown): void {
  const mapped = mapFocusSetupError(error);
  res.status(mapped.status).json(mapped.body);
}

router.get("/fiscal/focus/status", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req);
  const [settings] = await db.select().from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId, actor.storeId)).limit(1);
  const environment = settings?.environment === "production" ? "production" : "homologation";
  const baseToken = resolveFocusNfeToken(environment);
  const company = await getFocusCompanySummary(actor.storeId);
  res.json({ provider: settings?.provider ?? "focus_nfe", environment, baseIntegrationConfigured: Boolean(baseToken.token), companyLinked: company.companyLinked, homologationCredentialConfigured: company.homologationCredentialConfigured, productionCredentialConfigured: company.productionCredentialConfigured, certificateConfigured: company.certificateConfigured, certificateStatus: company.certificateStatus, certificateExpiresAt: company.certificateExpiresAt, cscConfigured: company.cscConfigured, setupStatus: company.setupStatus, readyForHomologationTest: company.readyForHomologationTest, readyForHomologation: company.readyForHomologation, readyForProduction: company.readyForProduction, missingRequirements: company.missingRequirements });
});

router.get("/fiscal/focus/company", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res) => { const actor = await resolveCurrentActor(req); res.json(await getFocusCompanySummary(actor.storeId)); });

router.post("/fiscal/focus/company/link", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req); const body = (req.body ?? {}) as Record<string, unknown>;
  const providerCompanyId = clean(body.providerCompanyId, 120); const homologationToken = clean(body.homologationToken, 500); const productionToken = clean(body.productionToken, 500);
  if (!providerCompanyId || !homologationToken) { res.status(400).json({ error: "Informe providerCompanyId e token de homologação da Focus NFe." }); return; }
  try { res.status(200).json(await linkExistingFocusCompany({ storeId: actor.storeId, actorUserId: actor.id, providerCompanyId, homologationToken, productionToken: productionToken || undefined })); } catch (error) { sendSetupError(res, error); }
});

router.post("/fiscal/focus/certificate", requireRole("max_control"), requireStoreFeature("fiscal"), express.raw({ type: "multipart/form-data", limit: "6mb" }), async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req);
  let parsed: Awaited<ReturnType<typeof parseCertificateMultipartRequest>> | undefined;
  let serviceBuffer: Buffer | undefined;
  try {
    parsed = await parseCertificateMultipartRequest(req);
    serviceBuffer = Buffer.from(parsed.content);
    const summary = await uploadFocusCertificate({ storeId: actor.storeId, actorUserId: actor.id, filename: parsed.filename, content: serviceBuffer, password: parsed.password });
    res.status(200).json(summary);
  } catch (error) {
    sendSetupError(res, error instanceof SyntaxError ? new FocusSetupError(CERTIFICATE_VALIDATION_ERROR, "Upload multipart inválido.") : error);
  } finally {
    parsed?.content.fill(0);
    parsed?.multipartBody?.fill(0);
    serviceBuffer?.fill(0);
  }
});

router.put("/fiscal/focus/csc", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req); const body = (req.body ?? {}) as Record<string, unknown>;
  try { res.status(200).json(await configureFocusCsc({ storeId: actor.storeId, actorUserId: actor.id, cscId: clean(body.cscId, 20), cscSecret: clean(body.cscSecret, 500) })); } catch (error) { sendSetupError(res, error); }
});

router.post("/fiscal/focus/company/register", requireRole("max_control"), requireStoreFeature("fiscal"), async (_req, res) => { try { await registerFocusCompany(); } catch { res.status(501).json({ code: "INTERNAL_ERROR", error: "Cadastro automático indisponível." }); } });
export default router;
