import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tablesRouter from "./tables";
import customersRouter from "./customers";
import menuRouter from "./menu";
import ordersRouter from "./orders";
import paymentsRouter from "./payments";
import kitchenRouter from "./kitchen";
import dashboardRouter from "./dashboard";
import cashRouter from "./cash";
import deliveryRouter from "./delivery";
import couriersRouter from "./couriers";
import settingsRouter from "./settings";
import alertsRouter from "./alerts";
import integrationsRouter from "./integrations";
import deliveryDistanceRouter from "./delivery-distance";
import devRouter from "./dev";
import adminRouter from "./admin";
import authRouter from "./auth";
import platformRouter from "./platform";
import billingRouter from "./billing";
import onboardingRouter from "./onboarding";
import teamRouter from "./team";
import { attachCurrentActor, rbacRouteGuard } from "../middleware/rbac";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(platformRouter);
router.use(billingRouter);
router.use(onboardingRouter);

router.use(attachCurrentActor);
router.use(rbacRouteGuard);

router.use(tablesRouter);
router.use(customersRouter);
router.use(menuRouter);
router.use(ordersRouter);
router.use(paymentsRouter);
router.use(kitchenRouter);
router.use(dashboardRouter);
router.use(cashRouter);
router.use(deliveryRouter);
router.use(couriersRouter);
router.use(settingsRouter);
router.use(teamRouter);
router.use(alertsRouter);
router.use(integrationsRouter);
router.use(deliveryDistanceRouter);
router.use(devRouter);
router.use(adminRouter);

export default router;
