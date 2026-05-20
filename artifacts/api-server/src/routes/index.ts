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

export default router;
