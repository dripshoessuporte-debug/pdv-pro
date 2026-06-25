import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createRequire } from "node:module";
import { eq } from "drizzle-orm";
import { db, storeFiscalSettingsTable } from "@workspace/db";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";
import { resolveFocusNfeToken } from "../integrations/focus-nfe";
import { configureFocusCsc, FocusSetupError, getFocusCompanySummary, linkExistingFocusCompany, registerFocusCompany, uploadFocusCertificate } from "../integrations/focus-nfe/company-service";


type MulterFile = { fieldname: string; originalname: string; buffer: Buffer; size: number };
type MulterErrorCtor = new (...args: unknown[]) => Error & { code?: string };
type MulterFactory = ((options: { storage?: unknown; limits?: { fileSize?: number; files?: number }; fileFilter?: (req: Request, file: MulterFile, cb: (error: Error | null, acceptFile?: boolean) => void) => void }) => { single(fieldName: string): (req: Request, res: Response, next: NextFunction) => void }) & { memoryStorage(): unknown; MulterError: MulterErrorCtor };
const multer = createRequire(import.meta.url)("multer") as MulterFactory;

const router: IRouter = Router();
const clean = (value: unknown, maxLength = 250): string => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");
const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;

const certificateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CERTIFICATE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname !== "certificate") return cb(new FocusSetupError("CERTIFICATE_VALIDATION_ERROR", "Campo de arquivo inesperado."));
    if (!/\.(pfx|p12)$/i.test(file.originalname)) return cb(new FocusSetupError("CERTIFICATE_VALIDATION_ERROR", "Envie um certificado A1 .pfx ou .p12."));
    cb(null, true);
  },
}).single("certificate");

function runCertificateUpload(req: Request, res: Response, next: NextFunction) {
  certificateUpload(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "O certificado deve ter no máximo 5 MB." : "Upload multipart inválido para o certificado.";
      return next(new FocusSetupError("CERTIFICATE_VALIDATION_ERROR", message));
    }
    return next(error);
  });
}

function sendSafeError(res: Response, error: unknown, fallback: string) {
  const setupError = error instanceof FocusSetupError ? error : null;
  res.status(setupError?.status ?? 400).json({ code: setupError?.code ?? "CERTIFICATE_VALIDATION_ERROR", error: setupError?.message ?? fallback });
}

router.get("/fiscal/focus/status", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req);
  const [settings] = await db.select().from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId, actor.storeId)).limit(1);
  const environment = settings?.environment === "production" ? "production" : "homologation";
  const baseToken = resolveFocusNfeToken(environment);
  const company = await getFocusCompanySummary(actor.storeId);
  res.json({ provider: settings?.provider ?? "focus_nfe", environment, baseIntegrationConfigured: Boolean(baseToken.token), companyLinked: company.companyLinked, homologationCredentialConfigured: company.homologationCredentialConfigured, productionCredentialConfigured: company.productionCredentialConfigured, certificateConfigured: company.certificateConfigured, certificateStatus: company.certificateStatus, certificateExpiresAt: company.certificateExpiresAt, cscConfigured: company.cscConfigured, setupStatus: company.setupStatus, readyForHomologation: company.readyForHomologation, readyForProduction: company.readyForProduction, missingRequirements: company.missingRequirements });
});

router.get("/fiscal/focus/company", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res) => { const actor = await resolveCurrentActor(req); res.json(await getFocusCompanySummary(actor.storeId)); });

router.post("/fiscal/focus/company/link", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req); const body = (req.body ?? {}) as Record<string, unknown>;
  const providerCompanyId = clean(body.providerCompanyId, 120); const homologationToken = clean(body.homologationToken, 500); const productionToken = clean(body.productionToken, 500);
  if (!providerCompanyId || !homologationToken) { res.status(400).json({ code: "CERTIFICATE_VALIDATION_ERROR", error: "Informe providerCompanyId e token de homologação da Focus NFe." }); return; }
  try { res.status(200).json(await linkExistingFocusCompany({ storeId: actor.storeId, actorUserId: actor.id, providerCompanyId, homologationToken, productionToken: productionToken || undefined })); } catch { res.status(500).json({ code: "LOCAL_PERSISTENCE_ERROR", error: "Não foi possível salvar o vínculo fiscal da loja com segurança." }); }
});

router.post("/fiscal/focus/certificate", requireRole("max_control"), requireStoreFeature("fiscal"), runCertificateUpload, async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req);
  const file = (req as Request & { file?: MulterFile }).file;
  try {
    if (!file) throw new FocusSetupError("CERTIFICATE_VALIDATION_ERROR", "Envie o arquivo no campo certificate.");
    await uploadFocusCertificate({ storeId: actor.storeId, actorUserId: actor.id, filename: file.originalname, content: file.buffer, password: clean(req.body?.certificatePassword, 500) });
    res.status(200).json(await getFocusCompanySummary(actor.storeId));
  } catch (error) { sendSafeError(res, error, "Não foi possível configurar o certificado A1."); }
});

router.put("/fiscal/focus/csc", requireRole("max_control"), requireStoreFeature("fiscal"), async (req, res): Promise<void> => {
  const actor = await resolveCurrentActor(req); const body = (req.body ?? {}) as Record<string, unknown>;
  try { res.status(200).json(await configureFocusCsc({ storeId: actor.storeId, actorUserId: actor.id, cscId: clean(body.cscId, 20), cscSecret: clean(body.cscSecret, 500) })); } catch (error) { sendSafeError(res, error, "Não foi possível configurar o CSC."); }
});

router.post("/fiscal/focus/company/register", requireRole("max_control"), requireStoreFeature("fiscal"), async (_req, res) => { try { await registerFocusCompany(); } catch (error) { res.status(501).json({ error: error instanceof Error ? error.message : "Cadastro automático indisponível." }); } });
export default router;
