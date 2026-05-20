import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tablesRouter from "./tables";
import customersRouter from "./customers";
import menuRouter from "./menu";
import ordersRouter from "./orders";
import paymentsRouter from "./payments";
import kitchenRouter from "./kitchen";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tablesRouter);
router.use(customersRouter);
router.use(menuRouter);
router.use(ordersRouter);
router.use(paymentsRouter);
router.use(kitchenRouter);
router.use(dashboardRouter);

export default router;
