import { Router, type IRouter } from "express";
import { requireRole } from "../middleware/rbac";
import { requireStoreFeature } from "../lib/store-features";

const router: IRouter = Router();

router.get(
  "/fiscal/access",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  (_req, res) => {
    const access = res.locals.storeFeatureAccess;
    res.json({
      feature: "fiscal",
      allowed: true,
      storeId: access.storeId,
      plan: access.plan,
      status: access.status,
    });
  },
);

export default router;
