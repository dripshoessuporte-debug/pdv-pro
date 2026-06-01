import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, tablesTable, customersTable, productsTable, productVariantsTable, kitchenTicketsTable, paymentsTable, cashMovementsTable } from "@workspace/db";
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
      paymentTiming: ordersTable.paymentTiming,
      deliveryPaymentMethod: ordersTable.deliveryPaymentMethod,
      needsChange: ordersTable.needsChange,
      changeFor: ordersTable.changeFor,
      deliveryPaymentNotes: ordersTable.deliveryPaymentNotes,
      paidAt: ordersTable.paidAt,
      closedAt: ordersTable.closedAt,
      source: ordersTable.source,
      externalOrderId: ordersTable.externalOrderId,
      integrationStatus: ordersTable.integrationStatus,
      estimatedDistanceKm: ordersTable.estimatedDistanceKm,
      deliveryFeeCalculated: ordersTable.deliveryFeeCalculated,
      deliveryFeeSource: ordersTable.deliveryFeeSource,
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
      productName: sql<string | null>`coalesce(${productsTable.name}, ${orderItemsTable.externalProductName})`,
      variantId: orderItemsTable.variantId,
      variantName: orderItemsTable.variantName,
      variantPrice: orderItemsTable.variantPrice,
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
    customerName: order.customerName ?? customerNameRegistered ?? null,
    totalAmount: parseFloat(String(order.totalAmount)),
    deliveryFee: parseFloat(String(order.deliveryFee ?? "0")),
    needsChange: order.needsChange == null ? null : order.needsChange === "true",
    changeFor: order.changeFor ? parseFloat(String(order.changeFor)) : null,
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    closedAt: order.closedAt ? order.closedAt.toISOString() : null,
    estimatedDistanceKm: order.estimatedDistanceKm ? parseFloat(String(order.estimatedDistanceKm)) : null,
    deliveryFeeCalculated: order.deliveryFeeCalculated === "true",
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: items.map((item) => ({
      ...item,
      variantPrice: item.variantPrice ? parseFloat(String(item.variantPrice)) : null,
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
      paymentTiming: ordersTable.paymentTiming,
      deliveryPaymentMethod: ordersTable.deliveryPaymentMethod,
      needsChange: ordersTable.needsChange,
      changeFor: ordersTable.changeFor,
      deliveryPaymentNotes: ordersTable.deliveryPaymentNotes,
      paidAt: ordersTable.paidAt,
      closedAt: ordersTable.closedAt,
      source: ordersTable.source,
      externalOrderId: ordersTable.externalOrderId,
      integrationStatus: ordersTable.integrationStatus,
      estimatedDistanceKm: ordersTable.estimatedDistanceKm,
      deliveryFeeCalculated: ordersTable.deliveryFeeCalculated,
      deliveryFeeSource: ordersTable.deliveryFeeSource,
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
        productName: sql<string | null>`coalesce(${productsTable.name}, ${orderItemsTable.externalProductName})`,
        variantId: orderItemsTable.variantId,
        variantName: orderItemsTable.variantName,
        variantPrice: orderItemsTable.variantPrice,
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
      needsChange: order.needsChange == null ? null : order.needsChange === "true",
      changeFor: order.changeFor ? parseFloat(String(order.changeFor)) : null,
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      closedAt: order.closedAt ? order.closedAt.toISOString() : null,
      estimatedDistanceKm: order.estimatedDistanceKm ? parseFloat(String(order.estimatedDistanceKm)) : null,
      deliveryFeeCalculated: order.deliveryFeeCalculated === "true",
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: items.map((item) => ({
        ...item,
        variantPrice: item.variantPrice ? parseFloat(String(item.variantPrice)) : null,
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

  const activeVariants = await db.select({
    id: productVariantsTable.id,
  }).from(productVariantsTable).where(and(
    eq(productVariantsTable.productId, parsed.data.productId),
    eq(productVariantsTable.active, true),
    eq(productVariantsTable.available, true),
  ));

  let unitPrice = parseFloat(String(product.price));
  let variantName: string | null = null;
  let variantPrice: number | null = null;
  let variantId: number | null = null;

  if (parsed.data.variantId != null) {
    const [variant] = await db.select().from(productVariantsTable).where(and(
      eq(productVariantsTable.id, parsed.data.variantId),
      eq(productVariantsTable.productId, parsed.data.productId),
      eq(productVariantsTable.active, true),
      eq(productVariantsTable.available, true),
    ));
    if (!variant) {
      res.status(400).json({ error: "Variação inválida para este produto." });
      return;
    }
    unitPrice = parseFloat(String(variant.price));
    variantId = variant.id;
    variantName = variant.name;
    variantPrice = unitPrice;
  } else if (activeVariants.length > 0) {
    res.status(400).json({ error: "Escolha uma variação para este produto." });
    return;
  }

  const totalPrice = unitPrice * parsed.data.quantity;

  const [item] = await db.insert(orderItemsTable).values({
    orderId: params.data.id,
    productId: parsed.data.productId,
    variantId,
    variantName,
    variantPrice: variantPrice != null ? String(variantPrice) : null,
    quantity: parsed.data.quantity,
    unitPrice: String(unitPrice),
    totalPrice: String(totalPrice),
    notes: parsed.data.notes,
  }).returning();

  await recalcOrderTotal(params.data.id);

  const itemWithName = {
    ...item,
    productName: product.name,
    variantPrice,
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

// ─── POST /orders/:id/finalize ("Dar Baixa") ─────────────────────────────────
// Encerra operacionalmente um pedido já pago/resolvido.
// Não cria pagamento — apenas garante status=closed e libera mesa se aplicável.

router.post("/orders/:id/finalize", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [order] = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      type: ordersTable.type,
      tableId: ordersTable.tableId,
      paymentTiming: ordersTable.paymentTiming,
      deliveryStatus: ordersTable.deliveryStatus,
      paidAt: ordersTable.paidAt,
    })
    .from(ordersTable)
    .where(eq(ordersTable.id, id));

  if (!order) { res.status(404).json({ error: "Pedido não encontrado" }); return; }
  if (order.status === "cancelled") { res.status(400).json({ error: "Pedido cancelado não pode ser finalizado" }); return; }

  // Already fully finalized
  if (order.status === "closed" && (order.type !== "delivery" || ["delivered", null].includes(order.deliveryStatus))) {
    res.status(409).json({ error: "Pedido já está finalizado" }); return;
  }

  // Delivery on_delivery: require payment + cash_movement to exist
  if (order.type === "delivery" && order.paymentTiming === "on_delivery") {
    if (order.deliveryStatus === "awaiting_settlement") {
      const [payment] = await db.select({ id: paymentsTable.id }).from(paymentsTable)
        .where(eq(paymentsTable.orderId, id)).limit(1);
      if (!payment) { res.status(400).json({ error: "Aguardando baixa financeira no Caixa" }); return; }
      const [movement] = await db.select({ id: cashMovementsTable.id }).from(cashMovementsTable)
        .where(eq(cashMovementsTable.orderId, id)).limit(1);
      if (!movement) { res.status(400).json({ error: "Aguardando registro no Caixa" }); return; }
    } else if (order.deliveryStatus !== "delivered" && order.deliveryStatus !== "out_for_delivery") {
      res.status(400).json({ error: `Aguardando entrega (status: ${order.deliveryStatus ?? "—"})` }); return;
    }
  }

  // Non-delivery and delivery-now: must be paid
  if (order.type !== "delivery" || order.paymentTiming !== "on_delivery") {
    if (!order.paidAt && order.status !== "closed") {
      res.status(400).json({ error: "Aguardando pagamento" }); return;
    }
  }

  const now = new Date();
  await db.update(ordersTable)
    .set({
      status: "closed",
      closedAt: now,
      deliveryStatus: order.type === "delivery" ? "delivered" : order.deliveryStatus,
    })
    .where(eq(ordersTable.id, id));

  // Release table if applicable
  if (order.tableId) {
    await db.update(tablesTable)
      .set({ status: "available", currentOrderId: null })
      .where(eq(tablesTable.id, order.tableId));
  }

  req.log.info({ orderId: id }, "order finalized via dar-baixa");
  res.json({ ok: true });
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
