import { Router, type IRouter } from "express";
import { eq, and, sql, gte } from "drizzle-orm";
import { db, ordersTable, tablesTable, kitchenTicketsTable, orderItemsTable, productsTable, categoriesTable, customersTable, paymentsTable } from "@workspace/db";

import {
  GetDashboardSummaryResponse,
  GetRecentOrdersResponse,
  GetSalesByCategoryResponse,
} from "@workspace/api-zod";
import { getOperationalSessionStart } from "../lib/operational-session";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const operationalStart = await getOperationalSessionStart();

  const [revenueToday] = await db
    .select({ total: sql<string>`coalesce(sum(${paymentsTable.amount}), 0)` })
    .from(paymentsTable)
    .where(and(gte(paymentsTable.createdAt, operationalStart), eq(paymentsTable.status, "approved")));

  const [countToday] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, today), sql`${ordersTable.status} != 'cancelled'`));

  const [openOrders] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, operationalStart),
        sql`${ordersTable.status} in ('open', 'preparing', 'ready')`,
        sql`NOT (
          ${ordersTable.type} = 'delivery'
          AND ${ordersTable.deliveryStatus} IN (
            'out_for_delivery', 'delivered', 'awaiting_settlement', 'closed', 'cancelled'
          )
        )`
      )
    );

  const [awaitingSettlement] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(eq(ordersTable.deliveryStatus, "awaiting_settlement"));

  const [occupiedTables] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tablesTable)
    .where(eq(tablesTable.status, "occupied"));

  const [availableTables] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tablesTable)
    .where(eq(tablesTable.status, "available"));

  const [pendingTickets] = await db
    .select({ count: sql<number>`count(*)` })
    .from(kitchenTicketsTable)
    .innerJoin(ordersTable, eq(kitchenTicketsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(kitchenTicketsTable.status, "pending"),
        gte(ordersTable.createdAt, operationalStart)
      )
    );

  const summary = {
    totalOrdersToday: Number(countToday?.count ?? 0),
    totalRevenueToday: parseFloat(String(revenueToday?.total ?? 0)),
    openOrders: Number(openOrders?.count ?? 0),
    occupiedTables: Number(occupiedTables?.count ?? 0),
    availableTables: Number(availableTables?.count ?? 0),
    pendingKitchenTickets: Number(pendingTickets?.count ?? 0),
    awaitingSettlement: Number(awaitingSettlement?.count ?? 0),
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/recent-orders", async (_req, res): Promise<void> => {
  const orders = await db
    .select({
      id: ordersTable.id,
      tableId: ordersTable.tableId,
      tableNumber: tablesTable.number,
      customerId: ordersTable.customerId,
      customerName: customersTable.name,
      status: ordersTable.status,
      type: ordersTable.type,
      notes: ordersTable.notes,
      totalAmount: ordersTable.totalAmount,
      deliveryFee: ordersTable.deliveryFee,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
    })
    .from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .orderBy(sql`${ordersTable.createdAt} DESC`)
    .limit(10);

  const ordersWithItems = await Promise.all(orders.map(async (order) => {
    const items = await db
      .select({
        id: orderItemsTable.id,
        orderId: orderItemsTable.orderId,
        productId: orderItemsTable.productId,
        productName: productsTable.name,
        quantity: orderItemsTable.quantity,
        unitPrice: orderItemsTable.unitPrice,
        totalPrice: orderItemsTable.totalPrice,
        notes: orderItemsTable.notes,
      })
      .from(orderItemsTable)
      .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .where(eq(orderItemsTable.orderId, order.id));

    return {
      ...order,
      totalAmount: parseFloat(String(order.totalAmount)),
      deliveryFee: parseFloat(String(order.deliveryFee ?? "0")),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: items.map((item) => ({
        ...item,
        unitPrice: parseFloat(String(item.unitPrice)),
        totalPrice: parseFloat(String(item.totalPrice)),
      })),
    };
  }));

  res.json(GetRecentOrdersResponse.parse(ordersWithItems));
});

router.get("/dashboard/sales-by-category", async (_req, res): Promise<void> => {
  const operationalStart = await getOperationalSessionStart();

  const rows = await db
    .select({
      categoryId: categoriesTable.id,
      categoryName: categoriesTable.name,
      totalSales: sql<string>`coalesce(sum(${orderItemsTable.totalPrice}), 0)`,
      itemCount: sql<number>`count(${orderItemsTable.id})`,
    })
    .from(categoriesTable)
    .leftJoin(productsTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(orderItemsTable, eq(orderItemsTable.productId, productsTable.id))
    .leftJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .leftJoin(paymentsTable, eq(paymentsTable.orderId, ordersTable.id))
    .where(
      and(
        gte(ordersTable.createdAt, operationalStart),
        gte(paymentsTable.createdAt, operationalStart),
        eq(paymentsTable.status, "approved")
      )
    )
    .groupBy(categoriesTable.id, categoriesTable.name)
    .orderBy(sql`sum(${orderItemsTable.totalPrice}) DESC NULLS LAST`);

  const result = rows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    totalSales: parseFloat(String(row.totalSales)),
    itemCount: Number(row.itemCount),
  }));

  res.json(GetSalesByCategoryResponse.parse(result));
});

export default router;
