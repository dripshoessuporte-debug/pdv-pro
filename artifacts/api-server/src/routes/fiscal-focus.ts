import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storeFiscalSettingsTable } from "@workspace/db";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";
import { resolveFocusNfeToken } from "../integrations/focus-nfe";
import { getFocusCompanySummary, linkExistingFocusCompany, registerFocusCompany } from "../integrations/focus-nfe/company-service";

const router: IRouter = Router();

const clean = (value: unknown, maxLength = 250): string => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

router.get(
  "/fiscal/focus/status",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req, res): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    const [settings] = await db
      .select({
        provider: storeFiscalSettingsTable.provider,
        environment: storeFiscalSettingsTable.environment,
        providerCompanyId: storeFiscalSettingsTable.providerCompanyId,
        certificateReference: storeFiscalSettingsTable.certificateReference,
        certificateStatus: storeFiscalSettingsTable.certificateStatus,
        certificateExpiresAt: storeFiscalSettingsTable.certificateExpiresAt,
        cscId: storeFiscalSettingsTable.cscId,
        cscSecretReference: storeFiscalSettingsTable.cscSecretReference,
        setupStatus: storeFiscalSettingsTable.setupStatus,
      })
      .from(storeFiscalSettingsTable)
      .where(eq(storeFiscalSettingsTable.storeId, actor.storeId))
      .limit(1);

    const environment = settings?.environment === "production" ? "production" : "homologation";
    const baseToken = resolveFocusNfeToken(environment);
    const company = await getFocusCompanySummary(actor.storeId);

    res.json({
      provider: settings?.provider ?? "focus_nfe",
      environment,
      clientConfigured: Boolean(baseToken.token),
      baseIntegrationConfigured: Boolean(baseToken.token),
      providerCompanyLinked: Boolean(settings?.providerCompanyId),
      companyLinked: company.companyLinked,
      providerCompanyId: settings?.providerCompanyId ?? null,
      homologationCredentialConfigured: company.homologationCredentialConfigured,
      productionCredentialConfigured: company.productionCredentialConfigured,
      certificateConfigured: Boolean(settings?.certificateReference && settings.certificateStatus !== "invalid"),
      cscConfigured: Boolean(settings?.cscId && settings?.cscSecretReference),
      setupStatus: settings?.setupStatus ?? "not_configured",
      certificateStatus: settings?.certificateStatus ?? null,
      certificateExpiresAt: settings?.certificateExpiresAt ?? null,
    });
  },
);

router.get(
  "/fiscal/focus/company",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req, res): Promise<void> => {
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
      res.status(400).json({ error: "Informe providerCompanyId e token de homologação da Focus NFe." });
      return;
    }

    try {
      const summary = await linkExistingFocusCompany({
        storeId: actor.storeId,
        actorUserId: actor.id,
        providerCompanyId,
        homologationToken,
        productionToken: productionToken || undefined,
      });
      res.status(200).json(summary);
    } catch {
      res.status(500).json({ error: "Não foi possível salvar o vínculo fiscal da loja com segurança." });
    }
  },
);

router.post(
  "/fiscal/focus/company/register",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (_req, res): Promise<void> => {
    try {
      await registerFocusCompany();
    } catch (error) {
      res.status(501).json({ error: error instanceof Error ? error.message : "Cadastro automático indisponível." });
    }
  },
);

export default router;
