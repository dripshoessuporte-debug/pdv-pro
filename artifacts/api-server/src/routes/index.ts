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

const router: IRouter = Router();

router.use(healthRouter);
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
router.use(alertsRouter);
router.use(integrationsRouter);
router.use(deliveryDistanceRouter);
router.use(devRouter);

export default router;
