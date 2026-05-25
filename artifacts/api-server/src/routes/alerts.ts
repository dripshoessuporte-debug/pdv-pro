import { Router, type IRouter } from "express";
import { eq, and, inArray, notInArray, lt, gte, sql, isNull } from "drizzle-orm";
import {
  db,
  ordersTable,
  deliveryRoutesTable,
  deliveryRouteOrdersTable,
} from "@workspace/db";
import { getOperationalSessionStart, getOpenRegisterOpenedAt } from "../lib/operational-session";

const router: IRouter = Router();

router.get("/alerts", async (req, res) => {
  try {
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
    const operationalStart = await getOperationalSessionStart();
    const openRegisterOpenedAt = await getOpenRegisterOpenedAt();

    const [
      awaitingSettlementRows,
      routesInProgressRows,
      routesAvailableRows,
      readyNotActionedRows,
      activeRouteOrderRows,
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
        .where(
          and(
            eq(deliveryRoutesTable.status, "in_progress"),
            gte(deliveryRoutesTable.createdAt, operationalStart)
          )
        ),

      // 3. routesAvailable
      db
        .select({ id: deliveryRoutesTable.id })
        .from(deliveryRoutesTable)
        .where(
          and(
            eq(deliveryRoutesTable.status, "available"),
            gte(deliveryRoutesTable.createdAt, operationalStart)
          )
        ),

      // 4. readyNotActioned: orders still in "ready" status, last updated > 20 min ago
      db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.status, "ready"),
            gte(ordersTable.createdAt, operationalStart),
            lt(sql`coalesce(${ordersTable.readyAt}, ${ordersTable.updatedAt})`, twentyMinsAgo)
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
        .where(
          and(
            inArray(deliveryRoutesTable.status, ["available", "in_progress"]),
            gte(deliveryRoutesTable.createdAt, operationalStart)
          )
        ),
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
            gte(ordersTable.createdAt, operationalStart),
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
            inArray(ordersTable.deliveryStatus, ["preparing", "ready"]),
            gte(ordersTable.createdAt, operationalStart)
          )
        );
      deliveryWithoutRoute = rows.length;
    }

    // 6. cashRegisterOpenHours
    let cashRegisterOpenHours = 0;
    if (openRegisterOpenedAt) {
      const openedAt = new Date(openRegisterOpenedAt);
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
