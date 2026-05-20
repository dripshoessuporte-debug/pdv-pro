import { Router, type IRouter } from "express";
import { eq, and, sql, gte } from "drizzle-orm";
import { db, ordersTable, tablesTable, kitchenTicketsTable, orderItemsTable, productsTable, categoriesTable, customersTable, paymentsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRecentOrdersResponse,
  GetSalesByCategoryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [revenueToday] = await db
    .select({ total: sql<string>`coalesce(sum(${ordersTable.totalAmount}), 0)` })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, today), eq(ordersTable.status, "closed")));

  const [countToday] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, today), sql`${ordersTable.status} != 'cancelled'`));

  const [openOrders] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(sql`${ordersTable.status} in ('open', 'preparing', 'ready')`);

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
    .where(eq(kitchenTicketsTable.status, "pending"));

  const summary = {
    totalOrdersToday: Number(countToday?.count ?? 0),
    totalRevenueToday: parseFloat(String(revenueToday?.total ?? 0)),
    openOrders: Number(openOrders?.count ?? 0),
    occupiedTables: Number(occupiedTables?.count ?? 0),
    availableTables: Number(availableTables?.count ?? 0),
    pendingKitchenTickets: Number(pendingTickets?.count ?? 0),
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
