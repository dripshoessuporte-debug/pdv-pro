import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, tablesTable, customersTable, productsTable, kitchenTicketsTable } from "@workspace/db";
import {
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
  AddOrderItemParams,
  AddOrderItemBody,
  RemoveOrderItemParams,
  SendOrderToKitchenParams,
  CancelOrderParams,
  ListOrdersQueryParams,
  ListOrdersResponse,
  GetOrderResponse,
  UpdateOrderResponse,
  SendOrderToKitchenResponse,
  CancelOrderResponse,
  UpdateDeliveryStatusParams,
  UpdateDeliveryStatusBody,
  UpdateDeliveryStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrderWithItems(orderId: number) {
  const [order] = await db
    .select({
      id: ordersTable.id,
      tableId: ordersTable.tableId,
      tableNumber: tablesTable.number,
      customerId: ordersTable.customerId,
      customerName: ordersTable.customerName,
      customerNameRegistered: customersTable.name,
      status: ordersTable.status,
      type: ordersTable.type,
      notes: ordersTable.notes,
      totalAmount: ordersTable.totalAmount,
      customerPhone: ordersTable.customerPhone,
      deliveryCep: ordersTable.deliveryCep,
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryReference: ordersTable.deliveryReference,
      deliveryFee: ordersTable.deliveryFee,
      deliveryNotes: ordersTable.deliveryNotes,
      deliveryStatus: ordersTable.deliveryStatus,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
    })
    .from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.id, orderId));

  if (!order) return null;

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
    .where(eq(orderItemsTable.orderId, orderId));

  const { customerNameRegistered, ...orderRest } = order;
  return {
    ...orderRest,
    // prefer the name typed at order creation; fall back to registered customer name
    customerName: order.customerName ?? customerNameRegistered ?? null,
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
}

async function recalcOrderTotal(orderId: number) {
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const itemsTotal = items.reduce((sum, item) => sum + parseFloat(String(item.totalPrice)), 0);
  const [order] = await db
    .select({ deliveryFee: ordersTable.deliveryFee })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  const fee = parseFloat(String(order?.deliveryFee ?? "0"));
  await db.update(ordersTable).set({ totalAmount: String(itemsTotal + fee) }).where(eq(ordersTable.id, orderId));
}

router.get("/orders", async (req, res): Promise<void> => {
  const queryParams = ListOrdersQueryParams.safeParse(req.query);
  const { status, tableId } = queryParams.success ? queryParams.data : { status: undefined, tableId: undefined };

  const conditions = [];
  if (status) conditions.push(eq(ordersTable.status, status));
  if (tableId) conditions.push(eq(ordersTable.tableId, tableId));

  const orders = await db
    .select({
      id: ordersTable.id,
      tableId: ordersTable.tableId,
      tableNumber: tablesTable.number,
      customerId: ordersTable.customerId,
      customerName: ordersTable.customerName,
      customerNameRegistered: customersTable.name,
      status: ordersTable.status,
      type: ordersTable.type,
      notes: ordersTable.notes,
      totalAmount: ordersTable.totalAmount,
      customerPhone: ordersTable.customerPhone,
      deliveryCep: ordersTable.deliveryCep,
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryReference: ordersTable.deliveryReference,
      deliveryFee: ordersTable.deliveryFee,
      deliveryNotes: ordersTable.deliveryNotes,
      deliveryStatus: ordersTable.deliveryStatus,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
    })
    .from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${ordersTable.createdAt} DESC`);

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

    const { customerNameRegistered, ...orderRest } = order;
    return {
      ...orderRest,
      customerName: order.customerName ?? customerNameRegistered ?? null,
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

  res.json(ListOrdersResponse.parse(ordersWithItems));
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { deliveryFee, needsChange, changeFor, ...restData } = parsed.data;
  const fee = deliveryFee ?? 0;

  const [order] = await db.insert(ordersTable).values({
    ...restData,
    deliveryFee: String(fee),
    totalAmount: String(fee), // items added after via addOrderItem; recalcOrderTotal updates this
    ...(parsed.data.type === "delivery" ? { deliveryStatus: "pending" } : {}),
    ...(needsChange !== undefined ? { needsChange: String(needsChange) } : {}),
    ...(changeFor !== undefined ? { changeFor: String(changeFor) } : {}),
  }).returning();

  if (parsed.data.tableId) {
    await db.update(tablesTable)
      .set({ status: "occupied", currentOrderId: order.id })
      .where(eq(tablesTable.id, parsed.data.tableId));
  }

  const full = await getOrderWithItems(order.id);
  res.status(201).json(GetOrderResponse.parse(full));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const order = await getOrderWithItems(params.data.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(GetOrderResponse.parse(order));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id));

  const order = await getOrderWithItems(params.data.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(UpdateOrderResponse.parse(order));
});

router.post("/orders/:id/items", async (req, res): Promise<void> => {
  const params = AddOrderItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddOrderItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parsed.data.productId));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const unitPrice = parseFloat(String(product.price));
  const totalPrice = unitPrice * parsed.data.quantity;

  const [item] = await db.insert(orderItemsTable).values({
    orderId: params.data.id,
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
    unitPrice: String(unitPrice),
    totalPrice: String(totalPrice),
    notes: parsed.data.notes,
  }).returning();

  await recalcOrderTotal(params.data.id);

  const itemWithName = {
    ...item,
    productName: product.name,
    unitPrice,
    totalPrice,
  };

  res.status(201).json(itemWithName);
});

router.delete("/orders/:id/items/:itemId", async (req, res): Promise<void> => {
  const params = RemoveOrderItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db.delete(orderItemsTable)
    .where(and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id)))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Order item not found" });
    return;
  }

  await recalcOrderTotal(params.data.id);

  res.sendStatus(204);
});

router.post("/orders/:id/send-to-kitchen", async (req, res): Promise<void> => {
  const params = SendOrderToKitchenParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // For delivery orders, advance deliveryStatus from pending → preparing
  const [current] = await db.select({ type: ordersTable.type, deliveryStatus: ordersTable.deliveryStatus })
    .from(ordersTable).where(eq(ordersTable.id, params.data.id));

  const now = new Date();
  await db.update(ordersTable).set({
    status: "preparing",
    kitchenAcceptedAt: now,
    ...(current?.type === "delivery" && current.deliveryStatus === "pending"
      ? { deliveryStatus: "preparing" }
      : {}),
  }).where(eq(ordersTable.id, params.data.id));
  await db.insert(kitchenTicketsTable).values({ orderId: params.data.id, status: "pending" });

  const order = await getOrderWithItems(params.data.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(SendOrderToKitchenResponse.parse(order));
});

router.post("/orders/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  await db.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, params.data.id));

  if (order.tableId) {
    await db.update(tablesTable)
      .set({ status: "available", currentOrderId: null })
      .where(and(eq(tablesTable.id, order.tableId), eq(tablesTable.currentOrderId, params.data.id)));
  }

  const full = await getOrderWithItems(params.data.id);
  res.json(CancelOrderResponse.parse(full));
});

router.patch("/orders/:id/delivery-status", async (req, res): Promise<void> => {
  const params = UpdateDeliveryStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDeliveryStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select({ id: ordersTable.id, kitchenAcceptedAt: ordersTable.kitchenAcceptedAt }).from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const newDeliveryStatus = parsed.data.deliveryStatus;
  const setData: Record<string, string | Date | null> = { deliveryStatus: newDeliveryStatus };
  if (newDeliveryStatus === "preparing" && !existing.kitchenAcceptedAt) {
    setData.kitchenAcceptedAt = new Date();
  }

  await db.update(ordersTable)
    .set(setData)
    .where(eq(ordersTable.id, params.data.id));

  const order = await getOrderWithItems(params.data.id);
  res.json(UpdateDeliveryStatusResponse.parse(order));
});

export default router;
