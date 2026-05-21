import { Router, type IRouter } from "express";
import { eq, and, inArray, notInArray, isNull, lt } from "drizzle-orm";
import {
  db,
  ordersTable,
  deliveryRoutesTable,
  deliveryRouteOrdersTable,
  cashRegistersTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/alerts", async (req, res) => {
  try {
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);

    const [
      awaitingSettlementRows,
      routesInProgressRows,
      routesAvailableRows,
      readyNotActionedRows,
      activeRouteOrderRows,
      openRegisterRows,
    ] = await Promise.all([
      // 1. awaitingSettlement: deliveryStatus=awaiting_settlement AND paymentTiming=on_delivery AND not yet paid
      db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.deliveryStatus, "awaiting_settlement"),
            eq(ordersTable.paymentTiming, "on_delivery"),
            isNull(ordersTable.paidAt)
          )
        ),

      // 2. routesInProgress
      db
        .select({ id: deliveryRoutesTable.id })
        .from(deliveryRoutesTable)
        .where(eq(deliveryRoutesTable.status, "in_progress")),

      // 3. routesAvailable
      db
        .select({ id: deliveryRoutesTable.id })
        .from(deliveryRoutesTable)
        .where(eq(deliveryRoutesTable.status, "available")),

      // 4. readyNotActioned: orders still in "ready" status, last updated > 20 min ago
      db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.status, "ready"),
            lt(ordersTable.updatedAt, twentyMinsAgo)
          )
        ),

      // 5. active route order IDs (for deliveryWithoutRoute calc)
      db
        .select({ orderId: deliveryRouteOrdersTable.orderId })
        .from(deliveryRouteOrdersTable)
        .innerJoin(
          deliveryRoutesTable,
          eq(deliveryRouteOrdersTable.routeId, deliveryRoutesTable.id)
        )
        .where(inArray(deliveryRoutesTable.status, ["available", "in_progress"])),

      // 6. open cash register
      db
        .select({ openedAt: cashRegistersTable.openedAt })
        .from(cashRegistersTable)
        .where(isNull(cashRegistersTable.closedAt))
        .limit(1),
    ]);

    // 5. deliveryWithoutRoute: delivery orders preparing/ready but not in any active route
    const activeIds = activeRouteOrderRows.map((r) => r.orderId);
    let deliveryWithoutRoute = 0;
    if (activeIds.length > 0) {
      const rows = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.type, "delivery"),
            inArray(ordersTable.deliveryStatus, ["preparing", "ready"]),
            notInArray(ordersTable.id, activeIds)
          )
        );
      deliveryWithoutRoute = rows.length;
    } else {
      const rows = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.type, "delivery"),
            inArray(ordersTable.deliveryStatus, ["preparing", "ready"])
          )
        );
      deliveryWithoutRoute = rows.length;
    }

    // 6. cashRegisterOpenHours
    let cashRegisterOpenHours = 0;
    if (openRegisterRows.length > 0) {
      const openedAt = new Date(openRegisterRows[0].openedAt);
      cashRegisterOpenHours =
        (Date.now() - openedAt.getTime()) / (1000 * 60 * 60);
    }

    res.json({
      awaitingSettlement: awaitingSettlementRows.length,
      routesInProgress: routesInProgressRows.length,
      routesAvailable: routesAvailableRows.length,
      readyNotActioned: readyNotActionedRows.length,
      deliveryWithoutRoute,
      cashRegisterOpenHours,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching alerts");
    res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

export default router;
