import { Router, type IRouter, type Request, type Response } from "express";
import { resolveAuthenticatedContext } from "../lib/auth";
import { getStoreFeatureAccess } from "../lib/store-features";

export {
  resolveFiscalAccessStatus,
  type FiscalAccessStatusBody,
  type FiscalAccessStatusDependencies,
} from "./fiscal-access-status-core";
import {
  resolveFiscalAccessStatus,
  type FiscalAccessStatusDependencies,
} from "./fiscal-access-status-core";

export function createFiscalAccessStatusRouter(
  dependencies: FiscalAccessStatusDependencies = {
    resolveContext: resolveAuthenticatedContext,
    getFeatureAccess: getStoreFeatureAccess,
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

  return router;
}

export default createFiscalAccessStatusRouter();
