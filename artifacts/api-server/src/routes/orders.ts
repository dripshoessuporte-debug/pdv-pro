import { Router, type IRouter } from "express";
import { eq, and, sql, inArray, gte } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  tablesTable,
  customersTable,
  productsTable,
  productVariantsTable,
  addonGroupsTable,
  addonOptionsTable,
  productAddonGroupsTable,
  orderItemAddonsTable,
  kitchenTicketsTable,
  paymentsTable,
  cashMovementsTable,
} from "@workspace/db";
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
import {
  getCurrentActor,
  requireOpenShift,
  getCurrentOperationalScope,
} from "../middleware/rbac";
import { releaseTableIfOrderClosed } from "../lib/table-release";

const router: IRouter = Router();

async function getOrderWithItems(orderId: number, storeId?: number) {
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
    .where(
      storeId
        ? and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId))
        : eq(ordersTable.id, orderId),
    );

  if (!order) return null;

  const items = await db
    .select({
      id: orderItemsTable.id,
      orderId: orderItemsTable.orderId,
      productId: orderItemsTable.productId,
      productName: sql<
        string | null
      >`coalesce(${productsTable.name}, ${orderItemsTable.externalProductName})`,
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
    needsChange:
      order.needsChange == null ? null : order.needsChange === "true",
    changeFor: order.changeFor ? parseFloat(String(order.changeFor)) : null,
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    closedAt: order.closedAt ? order.closedAt.toISOString() : null,
    estimatedDistanceKm: order.estimatedDistanceKm
      ? parseFloat(String(order.estimatedDistanceKm))
      : null,
    deliveryFeeCalculated: order.deliveryFeeCalculated === "true",
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: await Promise.all(items.map(async (item) => ({
      ...item,
      variantPrice: item.variantPrice
        ? parseFloat(String(item.variantPrice))
        : null,
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

async function recalcOrderTotal(orderId: number, client: any = db) {
  const items = await client
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));
  const itemsTotal = items.reduce(
    (sum: number, item: { totalPrice: unknown }) => sum + parseFloat(String(item.totalPrice)),
    0,
  );
  const [order] = await client
    .select({ deliveryFee: ordersTable.deliveryFee })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  const fee = parseFloat(String(order?.deliveryFee ?? "0"));
  await client
    .update(ordersTable)
    .set({ totalAmount: String(itemsTotal + fee) })
    .where(eq(ordersTable.id, orderId));
}

router.get("/orders", async (req, res): Promise<void> => {
  const queryParams = ListOrdersQueryParams.safeParse(req.query);
  const { status, tableId } = queryParams.success
    ? queryParams.data
    : { status: undefined, tableId: undefined };

  const scope = await requireOpenShift(req, res);
  if (!scope) return;

  const conditions = [eq(ordersTable.storeId, scope.actor.storeId)];
  if (status) conditions.push(eq(ordersTable.status, status));
  if (tableId) conditions.push(eq(ordersTable.tableId, tableId));
  if (scope.actor.role === "atendente" && scope.openedAt) {
    conditions.push(gte(ordersTable.createdAt, scope.openedAt));
  }

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

  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select({
          id: orderItemsTable.id,
          orderId: orderItemsTable.orderId,
          productId: orderItemsTable.productId,
          productName: sql<
            string | null
          >`coalesce(${productsTable.name}, ${orderItemsTable.externalProductName})`,
          variantId: orderItemsTable.variantId,
          variantName: orderItemsTable.variantName,
          variantPrice: orderItemsTable.variantPrice,
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
        .where(eq(orderItemsTable.orderId, order.id));

      const { customerNameRegistered, ...orderRest } = order;
      return {
        ...orderRest,
        customerName: order.customerName ?? customerNameRegistered ?? null,
        totalAmount: parseFloat(String(order.totalAmount)),
        deliveryFee: parseFloat(String(order.deliveryFee ?? "0")),
        needsChange:
          order.needsChange == null ? null : order.needsChange === "true",
        changeFor: order.changeFor ? parseFloat(String(order.changeFor)) : null,
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        closedAt: order.closedAt ? order.closedAt.toISOString() : null,
        estimatedDistanceKm: order.estimatedDistanceKm
          ? parseFloat(String(order.estimatedDistanceKm))
          : null,
        deliveryFeeCalculated: order.deliveryFeeCalculated === "true",
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        items: await Promise.all(items.map(async (item) => ({
          ...item,
          variantPrice: item.variantPrice
            ? parseFloat(String(item.variantPrice))
            : null,
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

  const scope = await requireOpenShift(req, res);
  if (!scope) return;
  const storeId = scope.actor.storeId;

  if (parsed.data.tableId) {
    const [table] = await db
      .select({ id: tablesTable.id, storeId: tablesTable.storeId })
      .from(tablesTable)
      .where(
        and(
          eq(tablesTable.id, parsed.data.tableId),
          eq(tablesTable.storeId, storeId),
        ),
      )
      .limit(1);

    if (!table) {
      res.status(404).json({ error: "Mesa não encontrada nesta loja." });
      return;
    }

    const [existingOpenOrder] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.storeId, storeId),
          eq(ordersTable.tableId, parsed.data.tableId),
          inArray(ordersTable.status, ["open", "preparing", "ready"]),
        ),
      )
      .orderBy(sql`${ordersTable.createdAt} DESC`)
      .limit(1);

    if (existingOpenOrder) {
      const full = await getOrderWithItems(existingOpenOrder.id, storeId);
      res.status(409).json({
        error:
          "Esta mesa já possui comanda aberta. Abra a comanda existente para adicionar itens.",
        currentOrder: full,
        currentOrderId: existingOpenOrder.id,
      });
      return;
    }
  }

  const [order] = await db
    .insert(ordersTable)
    .values({
      ...restData,
      storeId,
      cashRegisterId: scope.cashRegisterId,
      deliveryFee: String(fee),
      totalAmount: String(fee), // items added after via addOrderItem; recalcOrderTotal updates this
      ...(parsed.data.type === "delivery" ? { deliveryStatus: "pending" } : {}),
      ...(needsChange !== undefined
        ? { needsChange: String(needsChange) }
        : {}),
      ...(changeFor !== undefined ? { changeFor: String(changeFor) } : {}),
    })
    .returning();

  if (parsed.data.tableId) {
    await db
      .update(tablesTable)
      .set({ status: "occupied", currentOrderId: order.id })
      .where(eq(tablesTable.id, parsed.data.tableId));
  }

  const full = await getOrderWithItems(order.id, storeId);
  res.status(201).json(GetOrderResponse.parse(full));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scope = await requireOpenShift(req, res);
  if (!scope) return;

  const order = await getOrderWithItems(params.data.id, scope.actor.storeId);
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

  const actor = await getCurrentActor(req);
  await db
    .update(ordersTable)
    .set(parsed.data)
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, actor.storeId),
      ),
    );

  if (parsed.data.status === "closed" || parsed.data.status === "cancelled") {
    await releaseTableIfOrderClosed(params.data.id);
  }

  const order = await getOrderWithItems(params.data.id, actor.storeId);
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

  const scope = await requireOpenShift(req, res);
  if (!scope) return;

  const [order] = await db
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (["closed", "cancelled"].includes(order.status)) {
    res.status(409).json({
      error:
        "Não é possível adicionar itens a um pedido finalizado ou cancelado.",
    });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, parsed.data.productId),
        eq(productsTable.storeId, scope.actor.storeId),
      ),
    );
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const activeVariants = await db
    .select({
      id: productVariantsTable.id,
    })
    .from(productVariantsTable)
    .where(
      and(
        eq(productVariantsTable.productId, parsed.data.productId),
        eq(productVariantsTable.storeId, scope.actor.storeId),
        eq(productVariantsTable.active, true),
        eq(productVariantsTable.available, true),
      ),
    );

  let unitPrice = parseFloat(String(product.price));
  let variantName: string | null = null;
  let variantPrice: number | null = null;
  let variantId: number | null = null;

  if (parsed.data.variantId != null) {
    const [variant] = await db
      .select()
      .from(productVariantsTable)
      .where(
        and(
          eq(productVariantsTable.id, parsed.data.variantId),
          eq(productVariantsTable.productId, parsed.data.productId),
          eq(productVariantsTable.storeId, scope.actor.storeId),
          eq(productVariantsTable.active, true),
          eq(productVariantsTable.available, true),
        ),
      );
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

  const requestedAddons = (parsed.data.addons ?? []).map((addon) => ({
    addonOptionId: addon.addonOptionId,
    quantity: addon.quantity ?? 1,
  }));

  if (requestedAddons.some((addon) => addon.quantity < 1)) {
    res.status(400).json({ error: "Quantidade de adicional deve ser >= 1." });
    return;
  }

  const linkedGroups = await db
    .select({
      group: addonGroupsTable,
    })
    .from(productAddonGroupsTable)
    .innerJoin(
      addonGroupsTable,
      eq(productAddonGroupsTable.addonGroupId, addonGroupsTable.id),
    )
    .where(
      and(
        eq(productAddonGroupsTable.productId, parsed.data.productId),
        eq(productAddonGroupsTable.storeId, scope.actor.storeId),
        eq(addonGroupsTable.storeId, scope.actor.storeId),
        eq(addonGroupsTable.active, true),
      ),
    );
  const allowedGroupIds = new Set(linkedGroups.map((row) => row.group.id));
  const addonOptionIds = requestedAddons.map((addon) => addon.addonOptionId);
  const addonRows = addonOptionIds.length
    ? await db
        .select({ option: addonOptionsTable, group: addonGroupsTable })
        .from(addonOptionsTable)
        .innerJoin(addonGroupsTable, eq(addonOptionsTable.groupId, addonGroupsTable.id))
        .where(
          and(
            eq(addonOptionsTable.storeId, scope.actor.storeId),
            inArray(addonOptionsTable.id, addonOptionIds),
            eq(addonOptionsTable.available, true),
            eq(addonGroupsTable.active, true),
          ),
        )
    : [];

  if (addonRows.length !== new Set(addonOptionIds).size) {
    res.status(400).json({ error: "Adicional inválido ou indisponível." });
    return;
  }

  const addonById = new Map(addonRows.map((row) => [row.option.id, row]));
  const selectedByGroup = new Map<number, number>();
  let addonsTotal = 0;
  const addonSnapshots = [] as Array<{
    addonOptionId: number;
    addonGroupName: string;
    addonName: string;
    addonPrice: number;
    quantity: number;
    totalPrice: number;
  }>;
  for (const requested of requestedAddons) {
    const row = addonById.get(requested.addonOptionId);
    if (!row || !allowedGroupIds.has(row.group.id)) {
      res.status(400).json({ error: "Adicional não pertence a este produto/loja." });
      return;
    }
    selectedByGroup.set(
      row.group.id,
      (selectedByGroup.get(row.group.id) ?? 0) + requested.quantity,
    );
    const addonPrice = parseFloat(String(row.option.price));
    const total = addonPrice * requested.quantity * parsed.data.quantity;
    addonsTotal += addonPrice * requested.quantity;
    addonSnapshots.push({
      addonOptionId: row.option.id,
      addonGroupName: row.group.name,
      addonName: row.option.name,
      addonPrice,
      quantity: requested.quantity,
      totalPrice: total,
    });
  }

  for (const { group } of linkedGroups) {
    const selectedCount = selectedByGroup.get(group.id) ?? 0;
    const minimum = group.required ? Math.max(1, group.minSelected) : group.minSelected;
    if (selectedCount < minimum) {
      res.status(400).json({ error: `Selecione pelo menos ${minimum} opção(ões) em ${group.name}.` });
      return;
    }
    if (group.maxSelected != null && selectedCount > group.maxSelected) {
      res.status(400).json({ error: `Selecione no máximo ${group.maxSelected} opção(ões) em ${group.name}.` });
      return;
    }
  }

  try {
    const totalUnitPrice = unitPrice + addonsTotal;
    const totalPrice = totalUnitPrice * parsed.data.quantity;
    const itemWithName = await db.transaction(async (tx) => {
      const [item] = await tx
        .insert(orderItemsTable)
        .values({
          orderId: params.data.id,
          productId: parsed.data.productId,
          variantId,
          variantName,
          variantPrice: variantPrice != null ? String(variantPrice) : null,
          quantity: parsed.data.quantity,
          unitPrice: String(totalUnitPrice),
          totalPrice: String(totalPrice),
          notes: parsed.data.notes,
        })
        .returning();

      if (addonSnapshots.length) {
        await tx.insert(orderItemAddonsTable).values(
          addonSnapshots.map((addon) => ({
            orderItemId: item.id,
            addonOptionId: addon.addonOptionId,
            addonGroupName: addon.addonGroupName,
            addonName: addon.addonName,
            addonPrice: String(addon.addonPrice),
            quantity: addon.quantity,
            totalPrice: String(addon.totalPrice),
          })),
        );
      }

      await recalcOrderTotal(params.data.id, tx);

      return {
        ...item,
        productName: product.name,
        variantPrice,
        unitPrice: totalUnitPrice,
        totalPrice,
        addons: addonSnapshots,
      };
    });

    res.status(201).json(itemWithName);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Erro ao adicionar adicionais." });
  }
});

router.delete("/orders/:id/items/:itemId", async (req, res): Promise<void> => {
  const params = RemoveOrderItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scope = await requireOpenShift(req, res);
  if (!scope) return;

  const [item] = await db
    .select({ id: orderItemsTable.id })
    .from(orderItemsTable)
    .where(
      and(
        eq(orderItemsTable.id, params.data.itemId),
        eq(orderItemsTable.orderId, params.data.id),
      ),
    )
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Order item not found" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(orderItemAddonsTable)
      .where(eq(orderItemAddonsTable.orderItemId, params.data.itemId));
    await tx
      .delete(orderItemsTable)
      .where(
        and(
          eq(orderItemsTable.id, params.data.itemId),
          eq(orderItemsTable.orderId, params.data.id),
        ),
      );
    await recalcOrderTotal(params.data.id, tx);
  });

  res.sendStatus(204);
});

router.post("/orders/:id/send-to-kitchen", async (req, res): Promise<void> => {
  const params = SendOrderToKitchenParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scope = await requireOpenShift(req, res);
  if (!scope) return;

  // For delivery orders, advance deliveryStatus from pending → preparing
  const [current] = await db
    .select({
      type: ordersTable.type,
      deliveryStatus: ordersTable.deliveryStatus,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );

  const now = new Date();
  await db
    .update(ordersTable)
    .set({
      status: "preparing",
      kitchenAcceptedAt: now,
      ...(current?.type === "delivery" && current.deliveryStatus === "pending"
        ? { deliveryStatus: "preparing" }
        : {}),
    })
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );
  await db
    .insert(kitchenTicketsTable)
    .values({ orderId: params.data.id, status: "pending" });

  const order = await getOrderWithItems(params.data.id, scope.actor.storeId);
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

  const scope = await requireOpenShift(req, res);
  if (!scope) return;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  await db
    .update(ordersTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );
  await releaseTableIfOrderClosed(params.data.id);

  const full = await getOrderWithItems(params.data.id, scope.actor.storeId);
  res.json(CancelOrderResponse.parse(full));
});

// ─── POST /orders/:id/finalize ("Dar Baixa") ─────────────────────────────────
// Encerra operacionalmente um pedido já pago/resolvido.
// Não cria pagamento — apenas garante status=closed e libera mesa se aplicável.

router.post("/orders/:id/finalize", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const scope = await requireOpenShift(req, res);
  if (!scope) return;

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
    .where(
      and(eq(ordersTable.id, id), eq(ordersTable.storeId, scope.actor.storeId)),
    );

  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado" });
    return;
  }
  if (order.status === "cancelled") {
    res.status(400).json({ error: "Pedido cancelado não pode ser finalizado" });
    return;
  }

  // Already fully finalized
  if (
    order.status === "closed" &&
    (order.type !== "delivery" ||
      ["delivered", null].includes(order.deliveryStatus))
  ) {
    await releaseTableIfOrderClosed(id);
    res.status(409).json({ error: "Pedido já está finalizado" });
    return;
  }

  // Delivery on_delivery: require payment + cash_movement to exist
  if (order.type === "delivery" && order.paymentTiming === "on_delivery") {
    if (order.deliveryStatus === "awaiting_settlement") {
      const [payment] = await db
        .select({ id: paymentsTable.id })
        .from(paymentsTable)
        .where(eq(paymentsTable.orderId, id))
        .limit(1);
      if (!payment) {
        res.status(400).json({ error: "Aguardando baixa financeira no Caixa" });
        return;
      }
      const [movement] = await db
        .select({ id: cashMovementsTable.id })
        .from(cashMovementsTable)
        .where(eq(cashMovementsTable.orderId, id))
        .limit(1);
      if (!movement) {
        res.status(400).json({ error: "Aguardando registro no Caixa" });
        return;
      }
    } else if (
      order.deliveryStatus !== "delivered" &&
      order.deliveryStatus !== "out_for_delivery"
    ) {
      res.status(400).json({
        error: `Aguardando entrega (status: ${order.deliveryStatus ?? "—"})`,
      });
      return;
    }
  }

  // Non-delivery and delivery-now: must be paid
  if (order.type !== "delivery" || order.paymentTiming !== "on_delivery") {
    if (!order.paidAt && order.status !== "closed") {
      res.status(400).json({ error: "Aguardando pagamento" });
      return;
    }
  }

  const now = new Date();
  await db
    .update(ordersTable)
    .set({
      status: "closed",
      closedAt: now,
      deliveryStatus:
        order.type === "delivery" ? "delivered" : order.deliveryStatus,
    })
    .where(
      and(eq(ordersTable.id, id), eq(ordersTable.storeId, scope.actor.storeId)),
    );

  await releaseTableIfOrderClosed(id);

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

  const scope = await getCurrentOperationalScope(req);
  const [existing] = await db
    .select({
      id: ordersTable.id,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const newDeliveryStatus = parsed.data.deliveryStatus;
  const setData: Record<string, string | Date | null> = {
    deliveryStatus: newDeliveryStatus,
  };
  if (newDeliveryStatus === "preparing" && !existing.kitchenAcceptedAt) {
    setData.kitchenAcceptedAt = new Date();
  }

  await db
    .update(ordersTable)
    .set(setData)
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );

  const order = await getOrderWithItems(params.data.id, scope.actor.storeId);
  res.json(UpdateDeliveryStatusResponse.parse(order));
});

export default router;
