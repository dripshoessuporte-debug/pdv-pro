import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, storeFiscalSettingsTable } from "@workspace/db";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";
import { resolveFocusNfeToken } from "../integrations/focus-nfe";
import { CERTIFICATE_VALIDATION_ERROR, FocusSetupError, configureFocusCsc, getFocusCompanySummary, linkExistingFocusCompany, registerFocusCompany, uploadFocusCertificate } from "../integrations/focus-nfe/company-service";

const router: IRouter = Router();
const clean = (value: unknown, maxLength = 250): string => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");
const preserveString = (value: unknown, maxLength = 500): string => (typeof value === "string" ? value.slice(0, maxLength) : "");
const safeUploadError = (message: string) => ({ code: CERTIFICATE_VALIDATION_ERROR, error: message });
const routeError = (error: unknown, fallback: string) => error instanceof FocusSetupError ? { status: error.code === "FOCUS_APPLIED_LOCAL_SYNC_FAILED" ? 500 : 400, body: { code: error.code, error: error.message } } : { status: 400, body: { error: error instanceof Error ? error.message : fallback } };

async function readRaw(req: Request, max = 6 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += b.length; if (size > max) throw new Error("Arquivo excede o limite permitido."); chunks.push(b); }
  return Buffer.concat(chunks);
}

async function parseCertificateRequest(req: Request) {
  const type = String(req.headers["content-type"] ?? "");
  if (type.includes("application/json")) {
    const body = req.body as Record<string, unknown>;
    return { filename: clean(body.filename, 180) || "certificate.pfx", content: Buffer.from(clean(body.certificate, 8_000_000), "base64"), password: preserveString(body.certificatePassword, 500) };
  }
  const body = await readRaw(req);
  if (type.includes("multipart/form-data")) {
    const boundary = /boundary=([^;]+)/i.exec(type)?.[1]; if (!boundary) throw new Error("Upload multipart inválido.");
    const raw = body.toString("latin1"); let filename = "certificate.pfx"; let cert = Buffer.alloc(0); let password = ""; let fileCount = 0; if (!raw.includes(`--${boundary}--`)) throw new FocusSetupError(CERTIFICATE_VALIDATION_ERROR, "Upload multipart inválido.");
    for (const part of raw.split(`--${boundary}`)) {
      if (!part.includes("Content-Disposition")) continue;
      const name = /name="([^"]+)"/.exec(part)?.[1]; const fn = /filename="([^"]*)"/.exec(part)?.[1];
      const idx = part.indexOf("\r\n\r\n"); if (!name || idx < 0) continue;
      let value = part.slice(idx + 4); value = value.replace(/\r\n$/, "");
      if (fn && name !== "certificate") throw new FocusSetupError(CERTIFICATE_VALIDATION_ERROR, "Campo de arquivo inválido.");
      if (name === "certificate") { fileCount += 1; if (fileCount > 1) throw new FocusSetupError(CERTIFICATE_VALIDATION_ERROR, "Envie somente um certificado."); filename = fn || filename; cert = Buffer.from(value, "latin1"); }
      if (name === "certificatePassword") password = value;
    }
    if (fileCount === 0) throw new FocusSetupError(CERTIFICATE_VALIDATION_ERROR, "Envie o arquivo do certificado.");
    return { filename, content: cert, password };
  }
  return { filename: clean(req.headers["x-certificate-filename"], 180) || "certificate.pfx", content: body, password: preserveString(req.headers["x-certificate-password"], 500) };
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
  try { res.status(200).json(await linkExistingFocusCompany({ storeId: actor.storeId, actorUserId: actor.id, providerCompanyId, homologationToken, productionToken: productionToken || undefined })); } catch { res.status(500).json({ error: "Não foi possível salvar o vínculo fiscal da loja com segurança." }); }
});

router.post("/fiscal/focus/certificate", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req);
  try { const parsed = await parseCertificateRequest(req); const summary = await uploadFocusCertificate({ storeId: actor.storeId, actorUserId: actor.id, filename: parsed.filename, content: parsed.content, password: parsed.password }); res.status(200).json(summary); }
  catch (error) { const mapped = error instanceof FocusSetupError ? { status: error.code === "FOCUS_APPLIED_LOCAL_SYNC_FAILED" ? 500 : 400, body: { code: error.code, error: error.message } } : { status: 400, body: safeUploadError(error instanceof Error ? error.message : "Não foi possível configurar o certificado A1.") }; res.status(mapped.status).json(mapped.body); }
});

router.put("/fiscal/focus/csc", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req); const body = (req.body ?? {}) as Record<string, unknown>;
  try { res.status(200).json(await configureFocusCsc({ storeId: actor.storeId, actorUserId: actor.id, cscId: clean(body.cscId, 20), cscSecret: clean(body.cscSecret, 500) })); } catch (error) { const mapped = routeError(error, "Não foi possível configurar o CSC."); res.status(mapped.status).json(mapped.body); }
});

router.post("/fiscal/focus/company/register", requireRole("max_control"), requireStoreFeature("fiscal"), async (_req, res) => { try { await registerFocusCompany(); } catch (error) { res.status(501).json({ error: error instanceof Error ? error.message : "Cadastro automático indisponível." }); } });
export default router;
