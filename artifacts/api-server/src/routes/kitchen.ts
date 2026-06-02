import { Router, type IRouter } from "express";
import { eq, sql, and, gte } from "drizzle-orm";
import {
  db,
  kitchenTicketsTable,
  ordersTable,
  tablesTable,
  orderItemsTable,
  productsTable,
  orderItemAddonsTable,
} from "@workspace/db";
import {
  MarkTicketReadyParams,
  GetKitchenQueueResponse,
  MarkTicketReadyResponse,
} from "@workspace/api-zod";
import { getOperationalSessionStart } from "../lib/operational-session";
import { getCurrentActor } from "../middleware/rbac";

const router: IRouter = Router();

async function getTicketWithItems(ticketId: number, storeId?: number) {
  const [ticket] = await db
    .select({
      id: kitchenTicketsTable.id,
      orderId: kitchenTicketsTable.orderId,
      tableNumber: tablesTable.number,
      orderType: ordersTable.type,
      status: kitchenTicketsTable.status,
      notes: ordersTable.notes,
      createdAt: kitchenTicketsTable.createdAt,
    })
    .from(kitchenTicketsTable)
    .leftJoin(ordersTable, eq(kitchenTicketsTable.orderId, ordersTable.id))
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .where(
      storeId
        ? and(
            eq(kitchenTicketsTable.id, ticketId),
            eq(ordersTable.storeId, storeId),
          )
        : eq(kitchenTicketsTable.id, ticketId),
    );

  if (!ticket) return null;

  const items = await db
    .select({
      id: orderItemsTable.id,
      orderId: orderItemsTable.orderId,
      productId: orderItemsTable.productId,
      productName: sql<
        string | null
      >`coalesce(${productsTable.name}, ${orderItemsTable.externalProductName})`,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
      totalPrice: orderItemsTable.totalPrice,
      notes: orderItemsTable.notes,
    })
    .from(orderItemsTable)
    .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, ticket.orderId));

  return {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    items: await Promise.all(items.map(async (item) => ({
      ...item,
      unitPrice: parseFloat(String(item.unitPrice)),
      totalPrice: parseFloat(String(item.totalPrice)),
      addons: (await db.select().from(orderItemAddonsTable).where(eq(orderItemAddonsTable.orderItemId, item.id))).map((addon) => ({
        ...addon,
        addonPrice: parseFloat(String(addon.addonPrice)),
        totalPrice: parseFloat(String(addon.totalPrice)),
      })),
    }))),
  };
}

router.get("/kitchen/queue", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const operationalStart = await getOperationalSessionStart();

  const tickets = await db
    .select({
      id: kitchenTicketsTable.id,
      orderId: kitchenTicketsTable.orderId,
      tableNumber: tablesTable.number,
      orderType: ordersTable.type,
      status: kitchenTicketsTable.status,
      notes: ordersTable.notes,
      createdAt: kitchenTicketsTable.createdAt,
    })
    .from(kitchenTicketsTable)
    .leftJoin(ordersTable, eq(kitchenTicketsTable.orderId, ordersTable.id))
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .where(
      and(
        eq(kitchenTicketsTable.status, "pending"),
        eq(ordersTable.storeId, actor.storeId),
        gte(ordersTable.createdAt, operationalStart),
      ),
    );

  const ticketsWithItems = await Promise.all(
    tickets.map(async (ticket) => {
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
        .leftJoin(
          productsTable,
          eq(orderItemsTable.productId, productsTable.id),
        )
        .where(eq(orderItemsTable.orderId, ticket.orderId));

      return {
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
        items: await Promise.all(items.map(async (item) => ({
          ...item,
          unitPrice: parseFloat(String(item.unitPrice)),
          totalPrice: parseFloat(String(item.totalPrice)),
          addons: (await db.select().from(orderItemAddonsTable).where(eq(orderItemAddonsTable.orderItemId, item.id))).map((addon) => ({
            ...addon,
            addonPrice: parseFloat(String(addon.addonPrice)),
            totalPrice: parseFloat(String(addon.totalPrice)),
          })),
        }))),
      };
    }),
  );

  res.json(GetKitchenQueueResponse.parse(ticketsWithItems));
});

router.post("/kitchen/tickets/:id/ready", async (req, res): Promise<void> => {
  const params = MarkTicketReadyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const actor = await getCurrentActor(req);
  const [existingTicket] = await db
    .select({ id: kitchenTicketsTable.id })
    .from(kitchenTicketsTable)
    .innerJoin(ordersTable, eq(kitchenTicketsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(kitchenTicketsTable.id, params.data.id),
        eq(ordersTable.storeId, actor.storeId),
      ),
    )
    .limit(1);
  if (!existingTicket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const [ticket] = await db
    .update(kitchenTicketsTable)
    .set({ status: "ready" })
    .where(eq(kitchenTicketsTable.id, params.data.id))
    .returning();

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Fetch the order to check its type AND payment status
  const [order] = await db
    .select({
      type: ordersTable.type,
      status: ordersTable.status,
      paidAt: ordersTable.paidAt,
    })
    .from(ordersTable)
    .where(eq(ordersTable.id, ticket.orderId));

  const orderUpdate: Record<string, string> = {};

  // Only advance status to 'ready' if the order has NOT been paid yet.
  // If paidAt is set or status is already 'closed', the order was paid before the
  // kitchen finished — preserve the financial state; never revert 'closed' to 'ready'.
  if (!order?.paidAt && order?.status !== "closed") {
    orderUpdate.status = "ready";
  }

  // For delivery orders, advance deliveryStatus to 'ready' (pronto para entrega)
  // regardless of payment status — needed for route/delivery tracking.
  if (order?.type === "delivery") {
    orderUpdate.deliveryStatus = "ready";
  }

  if (Object.keys(orderUpdate).length > 0) {
    await db
      .update(ordersTable)
      .set(orderUpdate)
      .where(eq(ordersTable.id, ticket.orderId));
  }

  const full = await getTicketWithItems(ticket.id, actor.storeId);
  res.json(MarkTicketReadyResponse.parse(full));
});

export default router;
