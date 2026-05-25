import { Router, type IRouter } from "express";
import { eq, and, inArray, notInArray, lt, gte, sql, isNull } from "drizzle-orm";
import {
  db,
  ordersTable,
  deliveryRoutesTable,
  deliveryRouteOrdersTable,
  kitchenTicketsTable,
} from "@workspace/db";
import { getOperationalSessionStart, getOpenRegisterOpenedAt } from "../lib/operational-session";

const router: IRouter = Router();

/**
 * Delivery orders whose logistics are finished should NOT count as
 * operationally active regardless of orders.status.
 */
const LOGISTICALLY_DONE_STATUSES = [
  "out_for_delivery",
  "delivered",
  "awaiting_settlement",
  "closed",
  "cancelled",
] as const;

/**
 * SQL fragment that returns TRUE when a delivery order is logistically done
 * (i.e. it must be excluded from operational counts).
 */
const isLogisticallyDone = sql`(
  ${ordersTable.type} = 'delivery'
  AND ${ordersTable.deliveryStatus} IN (
    'out_for_delivery', 'delivered', 'awaiting_settlement', 'closed', 'cancelled'
  )
)`;

const isNotLogisticallyDone = sql`NOT ${isLogisticallyDone}`;

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
      activeOrdersRows,
      pendingKitchenRows,
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
      //    Excludes delivery orders that are logistically done (out_for_delivery, delivered, etc.)
      db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.status, "ready"),
            gte(ordersTable.createdAt, operationalStart),
            lt(sql`coalesce(${ordersTable.readyAt}, ${ordersTable.updatedAt})`, twentyMinsAgo),
            isNotLogisticallyDone
          )
        ),

      // 5. activeOrdersCount: operational orders pending action in current session
      //    Excludes delivery orders that are logistically done
      db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            gte(ordersTable.createdAt, operationalStart),
            inArray(ordersTable.status, ["open", "preparing", "ready"]),
            isNotLogisticallyDone
          )
        ),

      // 6. pendingKitchenCount: kitchen tickets still pending in the current session
      //    Uses kitchenTickets as source of truth (not orders.status).
      //    Excludes closed/cancelled orders and logistically-done deliveries.
      db
        .select({ id: ordersTable.id })
        .from(kitchenTicketsTable)
        .innerJoin(ordersTable, eq(kitchenTicketsTable.orderId, ordersTable.id))
        .where(
          and(
            eq(kitchenTicketsTable.status, "pending"),
            gte(ordersTable.createdAt, operationalStart),
            notInArray(ordersTable.status, ["closed", "cancelled"]),
            isNotLogisticallyDone
          )
        ),

      // 7. active route order IDs (for deliveryWithoutRoute calc)
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

    // 8. deliveryWithoutRoute: delivery orders preparing/ready but not in any active route
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

    // 9. cashRegisterOpenHours
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
      activeOrdersCount: activeOrdersRows.length,
      pendingKitchenCount: pendingKitchenRows.length,
      deliveryWithoutRoute,
      cashRegisterOpenHours,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching alerts");
    res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

export default router;
