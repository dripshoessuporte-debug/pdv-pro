import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storeFiscalSettingsTable } from "@workspace/db";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";
import { resolveFocusNfeToken } from "../integrations/focus-nfe";

const router: IRouter = Router();

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
    const token = resolveFocusNfeToken(environment);

    res.json({
      provider: settings?.provider ?? "focus_nfe",
      environment,
      clientConfigured: Boolean(token.token),
      providerCompanyLinked: Boolean(settings?.providerCompanyId),
      certificateConfigured: Boolean(settings?.certificateReference && settings.certificateStatus !== "invalid"),
      cscConfigured: Boolean(settings?.cscId && settings?.cscSecretReference),
      setupStatus: settings?.setupStatus ?? "not_configured",
      certificateStatus: settings?.certificateStatus ?? null,
      certificateExpiresAt: settings?.certificateExpiresAt ?? null,
    });
  },
);

export default router;
