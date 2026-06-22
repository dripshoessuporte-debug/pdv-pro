import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storeFiscalSettingsTable } from "@workspace/db";
import { requireRole } from "../middleware/rbac";
import { requireStoreFeature } from "../lib/store-features";

const router: IRouter = Router();

router.get(
  "/fiscal/access",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (_req, res): Promise<void> => {
    const access = res.locals.storeFeatureAccess;
    const [settings] = await db
      .select({
        setupStatus: storeFiscalSettingsTable.setupStatus,
        environment: storeFiscalSettingsTable.environment,
        emissionMode: storeFiscalSettingsTable.emissionMode,
      })
      .from(storeFiscalSettingsTable)
      .where(eq(storeFiscalSettingsTable.storeId, access.storeId))
      .limit(1);

    res.json({
      feature: "fiscal",
      allowed: true,
      storeId: access.storeId,
      plan: access.plan,
      status: access.status,
      setup: {
        configured: Boolean(settings),
        status: settings?.setupStatus ?? "not_configured",
        environment: settings?.environment ?? "homologation",
        emissionMode: settings?.emissionMode ?? "manual",
      },
    });
  },
);

export default router;
