import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, ordersTable, tablesTable } from "@workspace/db";

const OPEN_TABLE_ORDER_STATUSES = ["open", "preparing", "ready"] as const;
const CLOSED_TABLE_ORDER_STATUSES = ["closed", "cancelled"] as const;

type DbClient = typeof db;

/**
 * Keeps the operational table pointer in sync when an order leaves the open flow.
 * It only touches the table while it still points at the closed/cancelled order;
 * if another open command exists for the same table, that command becomes current.
 */
export async function releaseTableIfOrderClosed(orderId: number, client: DbClient = db): Promise<void> {
  const [order] = await client
    .select({ id: ordersTable.id, tableId: ordersTable.tableId, status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!order?.tableId || !CLOSED_TABLE_ORDER_STATUSES.includes(order.status as (typeof CLOSED_TABLE_ORDER_STATUSES)[number])) {
    return;
  }

  const [table] = await client
    .select({ id: tablesTable.id, currentOrderId: tablesTable.currentOrderId })
    .from(tablesTable)
    .where(eq(tablesTable.id, order.tableId))
    .limit(1);

  if (!table || table.currentOrderId !== orderId) {
    return;
  }

  const [nextOpenOrder] = await client
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tableId, order.tableId),
      ne(ordersTable.id, orderId),
      inArray(ordersTable.status, OPEN_TABLE_ORDER_STATUSES)
    ))
    .orderBy(sql`${ordersTable.createdAt} DESC`)
    .limit(1);

  await client
    .update(tablesTable)
    .set(nextOpenOrder
      ? { status: "occupied", currentOrderId: nextOpenOrder.id }
      : { status: "available", currentOrderId: null })
    .where(and(eq(tablesTable.id, order.tableId), eq(tablesTable.currentOrderId, orderId)));
}

export { OPEN_TABLE_ORDER_STATUSES };
