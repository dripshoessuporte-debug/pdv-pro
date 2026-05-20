import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, kitchenTicketsTable, ordersTable, tablesTable, orderItemsTable, productsTable } from "@workspace/db";
import {
  MarkTicketReadyParams,
  GetKitchenQueueResponse,
  MarkTicketReadyResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getTicketWithItems(ticketId: number) {
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
    .where(eq(kitchenTicketsTable.id, ticketId));

  if (!ticket) return null;

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
    .where(eq(orderItemsTable.orderId, ticket.orderId));

  return {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    items: items.map((item) => ({
      ...item,
      unitPrice: parseFloat(String(item.unitPrice)),
      totalPrice: parseFloat(String(item.totalPrice)),
    })),
  };
}

router.get("/kitchen/queue", async (_req, res): Promise<void> => {
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
    .where(eq(kitchenTicketsTable.status, "pending"));

  const ticketsWithItems = await Promise.all(tickets.map(async (ticket) => {
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
      .where(eq(orderItemsTable.orderId, ticket.orderId));

    return {
      ...ticket,
      createdAt: ticket.createdAt.toISOString(),
      items: items.map((item) => ({
        ...item,
        unitPrice: parseFloat(String(item.unitPrice)),
        totalPrice: parseFloat(String(item.totalPrice)),
      })),
    };
  }));

  res.json(GetKitchenQueueResponse.parse(ticketsWithItems));
});

router.post("/kitchen/tickets/:id/ready", async (req, res): Promise<void> => {
  const params = MarkTicketReadyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ticket] = await db.update(kitchenTicketsTable)
    .set({ status: "ready" })
    .where(eq(kitchenTicketsTable.id, params.data.id))
    .returning();

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Update order status to ready
  await db.update(ordersTable).set({ status: "ready" }).where(eq(ordersTable.id, ticket.orderId));

  const full = await getTicketWithItems(ticket.id);
  res.json(MarkTicketReadyResponse.parse(full));
});

export default router;
