import { Router, type IRouter, type Request, type Response } from "express";
import { isPlatformAdminRole, resolveAuthenticatedContext } from "../lib/auth";
import {
  getCurrentUserFiscalFeatureAccess,
  getStoreFeatureAccess,
} from "../lib/store-features";

export {
  resolveFiscalAccessStatus,
  type FiscalAccessStatusBody,
  type FiscalAccessStatusDependencies,
} from "./fiscal-access-status-core";
import {
  resolveFiscalAccessStatus,
  type FiscalAccessStatusDependencies,
} from "./fiscal-access-status-core";

function canUseDebugEndpoint(
  context: Awaited<ReturnType<typeof resolveAuthenticatedContext>>,
) {
  if (process.env.NODE_ENV !== "production") return true;
  return isPlatformAdminRole(context?.platformRole);
}

export function createFiscalAccessStatusRouter(
  dependencies: FiscalAccessStatusDependencies = {
    resolveContext: resolveAuthenticatedContext,
    getFeatureAccess: getStoreFeatureAccess,
    getCurrentUserFiscalAccess: getCurrentUserFiscalFeatureAccess,
  },
): IRouter {
  const router: IRouter = Router();

  router.get(
    "/fiscal/access-status",
    async (req: Request, res: Response): Promise<void> => {
      const result = await resolveFiscalAccessStatus(req, dependencies);
      res.status(result.status).json(result.body);
    },
  );

  router.get(
    "/fiscal/access-status/debug",
    async (req: Request, res: Response): Promise<void> => {
      const context = await dependencies.resolveContext(req).catch(() => null);
      if (!canUseDebugEndpoint(context)) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const accessStatus = await resolveFiscalAccessStatus(req, dependencies);
      res.status(200).json({
        userId: context?.user.id ?? null,
        currentStoreId: context?.currentStore?.id ?? null,
        currentStoreRole: context?.currentStore?.role ?? null,
        accessStatus: accessStatus.body,
        diagnosticStage: accessStatus.body.diagnosticStage ?? null,
      });
    },
  );

  return router;
}

export default createFiscalAccessStatusRouter();
