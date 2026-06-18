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
import { getOrderFinancialState } from "../lib/order-financial-state";
import {
  calculateDeliveryDistanceForStore,
  deliveryCalculationErrorStatus,
  INVALID_LOCAL_DELIVERY_DISTANCE_ERROR,
  isAllowedDeliveryDistanceKm,
} from "../lib/delivery-distance-calculator";

const router: IRouter = Router();

function cleanAddressPart(value: unknown): string | null {
  const trimmed = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed || null;
}

function buildDeliveryCustomerAddress(data: {
  deliveryAddress?: string | null;
  deliveryNumber?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryCep?: string | null;
  deliveryComplement?: string | null;
  deliveryReference?: string | null;
}): string | null {
  return (
    [
      [data.deliveryAddress, data.deliveryNumber]
        .map(cleanAddressPart)
        .filter(Boolean)
        .join(", "),
      data.deliveryNeighborhood,
      [data.deliveryCity, data.deliveryState]
        .map(cleanAddressPart)
        .filter(Boolean)
        .join(" - "),
      data.deliveryCep,
      data.deliveryComplement,
      data.deliveryReference,
      "Brasil",
    ]
      .map(cleanAddressPart)
      .filter(Boolean)
      .join(", ") || null
  );
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isLargeDistanceDivergence(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff > Math.max(1, Math.min(a, b) * 0.2);
}

function isDevRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

function createOrderErrorResponse(error: unknown): {
  error: string;
  details?: string;
  hint: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    error: "Erro ao criar pedido.",
    ...(isDevRuntime() ? { details: message } : {}),
    hint: "Banco desalinhado com o schema. Rode pnpm --filter @workspace/db db:migrate.",
  };
}

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
      deliveryNumber: ordersTable.deliveryNumber,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryCity: ordersTable.deliveryCity,
      deliveryState: ordersTable.deliveryState,
      deliveryComplement: ordersTable.deliveryComplement,
      deliveryReference: ordersTable.deliveryReference,
      deliveryFee: ordersTable.deliveryFee,
      deliveryNotes: ordersTable.deliveryNotes,
      deliveryStatus: ordersTable.deliveryStatus,
      paymentTiming: ordersTable.paymentTiming,
      deliveryPaymentMethod: ordersTable.deliveryPaymentMethod,
      needsChange: ordersTable.needsChange,
      changeFor: ordersTable.changeFor,
      deliveryPaymentNotes: ordersTable.deliveryPaymentNotes,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
      readyAt: ordersTable.readyAt,
      paidAt: ordersTable.paidAt,
      closedAt: ordersTable.closedAt,
      source: ordersTable.source,
      externalOrderId: ordersTable.externalOrderId,
      integrationStatus: ordersTable.integrationStatus,
      estimatedDistanceKm: ordersTable.estimatedDistanceKm,
      deliveryFeeCalculated: ordersTable.deliveryFeeCalculated,
      deliveryFeeSource: ordersTable.deliveryFeeSource,
      deliveryDistanceSource: ordersTable.deliveryDistanceSource,
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

  const financial = await getOrderFinancialState(orderId);
  const { customerNameRegistered, ...orderRest } = order;
  return {
    ...orderRest,
    customerName: order.customerName ?? customerNameRegistered ?? null,
    totalAmount: financial.totalAmount,
    financial,
    paidAmount: financial.paidAmount,
    outstandingAmount: financial.outstandingAmount,
    paymentState: financial.paymentState,
    deliveryFee: parseFloat(String(order.deliveryFee ?? "0")),
    needsChange:
      order.needsChange == null ? null : order.needsChange === "true",
    changeFor: order.changeFor ? parseFloat(String(order.changeFor)) : null,
    kitchenAcceptedAt: order.kitchenAcceptedAt
      ? order.kitchenAcceptedAt.toISOString()
      : null,
    readyAt: order.readyAt ? order.readyAt.toISOString() : null,
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    closedAt: order.closedAt ? order.closedAt.toISOString() : null,
    estimatedDistanceKm:
      order.estimatedDistanceKm != null
        ? parseFloat(String(order.estimatedDistanceKm))
        : null,
    deliveryFeeCalculated: order.deliveryFeeCalculated === "true",
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: await Promise.all(
      items.map(async (item) => ({
        ...item,
        variantPrice: item.variantPrice
          ? parseFloat(String(item.variantPrice))
          : null,
        unitPrice: parseFloat(String(item.unitPrice)),
        totalPrice: parseFloat(String(item.totalPrice)),
        addons: (
          await db
            .select()
            .from(orderItemAddonsTable)
            .where(eq(orderItemAddonsTable.orderItemId, item.id))
        ).map((addon) => ({
          ...addon,
          addonPrice: parseFloat(String(addon.addonPrice)),
          totalPrice: parseFloat(String(addon.totalPrice)),
        })),
      })),
    ),
  };
}

async function recalcOrderTotal(orderId: number, client: any = db) {
  const items = await client
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));
  const itemsTotal = items.reduce(
    (sum: number, item: { totalPrice: unknown }) =>
      sum + parseFloat(String(item.totalPrice)),
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
      deliveryNumber: ordersTable.deliveryNumber,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryCity: ordersTable.deliveryCity,
      deliveryState: ordersTable.deliveryState,
      deliveryComplement: ordersTable.deliveryComplement,
      deliveryReference: ordersTable.deliveryReference,
      deliveryFee: ordersTable.deliveryFee,
      deliveryNotes: ordersTable.deliveryNotes,
      deliveryStatus: ordersTable.deliveryStatus,
      paymentTiming: ordersTable.paymentTiming,
      deliveryPaymentMethod: ordersTable.deliveryPaymentMethod,
      needsChange: ordersTable.needsChange,
      changeFor: ordersTable.changeFor,
      deliveryPaymentNotes: ordersTable.deliveryPaymentNotes,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
      readyAt: ordersTable.readyAt,
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

      const financial = await getOrderFinancialState(order.id);
      const { customerNameRegistered, ...orderRest } = order;
      return {
        ...orderRest,
        customerName: order.customerName ?? customerNameRegistered ?? null,
        totalAmount: financial.totalAmount,
        financial,
        paidAmount: financial.paidAmount,
        outstandingAmount: financial.outstandingAmount,
        paymentState: financial.paymentState,
        deliveryFee: parseFloat(String(order.deliveryFee ?? "0")),
        needsChange:
          order.needsChange == null ? null : order.needsChange === "true",
        changeFor: order.changeFor ? parseFloat(String(order.changeFor)) : null,
        kitchenAcceptedAt: order.kitchenAcceptedAt
          ? order.kitchenAcceptedAt.toISOString()
          : null,
        readyAt: order.readyAt ? order.readyAt.toISOString() : null,
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        closedAt: order.closedAt ? order.closedAt.toISOString() : null,
        estimatedDistanceKm: order.estimatedDistanceKm
          ? parseFloat(String(order.estimatedDistanceKm))
          : null,
        deliveryFeeCalculated: order.deliveryFeeCalculated === "true",
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        items: await Promise.all(
          items.map(async (item) => ({
            ...item,
            variantPrice: item.variantPrice
              ? parseFloat(String(item.variantPrice))
              : null,
            unitPrice: parseFloat(String(item.unitPrice)),
            totalPrice: parseFloat(String(item.totalPrice)),
            addons: (
              await db
                .select()
                .from(orderItemAddonsTable)
                .where(eq(orderItemAddonsTable.orderItemId, item.id))
            ).map((addon) => ({
              ...addon,
              addonPrice: parseFloat(String(addon.addonPrice)),
              totalPrice: parseFloat(String(addon.totalPrice)),
            })),
          })),
        ),
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

  const {
    deliveryFee,
    needsChange,
    changeFor,
    estimatedDistanceKm: _previewEstimatedDistanceKm,
    deliveryFeeCalculated: _previewDeliveryFeeCalculated,
    deliveryFeeSource: _previewDeliveryFeeSource,
    deliveryDistanceSource: _previewDeliveryDistanceSource,
    ...restData
  } = parsed.data;
  let fee = deliveryFee ?? 0;
  let estimatedDistanceKm = numberOrNull(parsed.data.estimatedDistanceKm);
  let deliveryFeeCalculated = parsed.data.deliveryFeeCalculated ?? false;
  let deliveryFeeSource: string | null = parsed.data.deliveryFeeSource ?? null;
  let deliveryDistanceSource: string | null =
    parsed.data.deliveryDistanceSource ?? deliveryFeeSource;

  const scope = await requireOpenShift(req, res);
  if (!scope) return;
  const storeId = scope.actor.storeId;

  if (parsed.data.type === "delivery" && parsed.data.deliveryCep) {
    parsed.data.deliveryCep = parsed.data.deliveryCep.replace(/\D/g, "");
    const previewDistanceKm = estimatedDistanceKm;
    if (
      previewDistanceKm !== null &&
      !isAllowedDeliveryDistanceKm(previewDistanceKm)
    ) {
      res.status(422).json({ error: INVALID_LOCAL_DELIVERY_DISTANCE_ERROR });
      return;
    }
    const previewDeliveryFee = numberOrNull(deliveryFee);
    const customerAddress = buildDeliveryCustomerAddress(parsed.data);
    try {
      const distanceResult = await calculateDeliveryDistanceForStore({
        storeId,
        customerCep: parsed.data.deliveryCep,
        customerAddress,
        customerCity: parsed.data.deliveryCity ?? null,
        ignoreCache: previewDistanceKm !== null,
      });

      if (
        previewDistanceKm !== null &&
        isLargeDistanceDivergence(
          previewDistanceKm,
          distanceResult.estimatedDistanceKm,
        )
      ) {
        const diagnostic = {
          previewDistanceKm,
          backendDistanceKm: distanceResult.estimatedDistanceKm,
          previewDeliveryFee,
          backendDeliveryFee: distanceResult.deliveryFee,
          customerCep: parsed.data.deliveryCep,
          customerAddress,
          customerAddressUsed: distanceResult.customerAddressUsed,
          source: distanceResult.source,
          cached: distanceResult.cached,
        };
        req.log.warn(diagnostic, "delivery preview/create distance divergence");
        if (isDevRuntime()) {
          res.status(422).json({
            error:
              "Divergência grande entre prévia e recálculo da entrega; pedido não foi salvo.",
            diagnostic,
          });
          return;
        }
      }

      if (previewDistanceKm !== null) {
        estimatedDistanceKm = previewDistanceKm;
        deliveryFeeCalculated = parsed.data.deliveryFeeCalculated ?? true;
        deliveryFeeSource = parsed.data.deliveryFeeSource ?? "preview";
        deliveryDistanceSource =
          parsed.data.deliveryDistanceSource ??
          parsed.data.deliveryFeeSource ??
          "preview";
        if (previewDeliveryFee !== null) fee = previewDeliveryFee;
      } else {
        estimatedDistanceKm = distanceResult.estimatedDistanceKm;
        deliveryFeeCalculated = distanceResult.deliveryFeeCalculated;
        deliveryFeeSource = distanceResult.source;
        deliveryDistanceSource = distanceResult.source;
        if (
          distanceResult.deliveryFeeCalculated &&
          distanceResult.deliveryFee != null
        ) {
          fee = distanceResult.deliveryFee;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(deliveryCalculationErrorStatus(error))
        .json({ error: message });
      return;
    }
  }

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

  let order: typeof ordersTable.$inferSelect;
  try {
    [order] = await db
      .insert(ordersTable)
      .values({
        ...restData,
        storeId,
        cashRegisterId: scope.cashRegisterId,
        deliveryFee: String(fee),
        totalAmount: String(fee), // items added after via addOrderItem; recalcOrderTotal updates this
        ...(parsed.data.type === "delivery"
          ? {
              deliveryStatus: "pending",
              estimatedDistanceKm:
                estimatedDistanceKm !== null
                  ? String(estimatedDistanceKm)
                  : null,
              deliveryFeeCalculated: String(deliveryFeeCalculated),
              deliveryFeeSource,
              deliveryDistanceSource,
            }
          : {}),
        ...(needsChange !== undefined
          ? { needsChange: String(needsChange) }
          : {}),
        ...(changeFor !== undefined ? { changeFor: String(changeFor) } : {}),
      })
      .returning();
  } catch (error) {
    req.log.error({ error }, "failed to create order");
    res.status(500).json(createOrderErrorResponse(error));
    return;
  }

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

  const [currentOrder] = await db
    .select({
      id: ordersTable.id,
      type: ordersTable.type,
      deliveryCep: ordersTable.deliveryCep,
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNumber: ordersTable.deliveryNumber,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryCity: ordersTable.deliveryCity,
      deliveryState: ordersTable.deliveryState,
      deliveryComplement: ordersTable.deliveryComplement,
      deliveryReference: ordersTable.deliveryReference,
      estimatedDistanceKm: ordersTable.estimatedDistanceKm,
      deliveryFee: ordersTable.deliveryFee,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, actor.storeId),
      ),
    )
    .limit(1);

  if (!currentOrder) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  const nextType = String(updateData.type ?? currentOrder.type);
  const nextCep =
    typeof updateData.deliveryCep === "string"
      ? updateData.deliveryCep.replace(/\D/g, "")
      : currentOrder.deliveryCep;
  const shouldRecalculateDeliveryDistance =
    nextType === "delivery" &&
    Boolean(nextCep) &&
    (updateData.deliveryCep !== undefined ||
      updateData.deliveryAddress !== undefined ||
      updateData.deliveryNumber !== undefined ||
      updateData.deliveryNeighborhood !== undefined ||
      updateData.deliveryCity !== undefined ||
      updateData.deliveryState !== undefined ||
      updateData.deliveryComplement !== undefined ||
      updateData.deliveryReference !== undefined ||
      currentOrder.estimatedDistanceKm == null);

  if (typeof updateData.deliveryCep === "string") {
    updateData.deliveryCep = updateData.deliveryCep.replace(/\D/g, "");
  }

  if (shouldRecalculateDeliveryDistance && nextCep) {
    try {
      const distanceResult = await calculateDeliveryDistanceForStore({
        storeId: actor.storeId,
        customerCep: nextCep,
        customerAddress: buildDeliveryCustomerAddress({
          deliveryAddress: String(
            updateData.deliveryAddress ?? currentOrder.deliveryAddress ?? "",
          ),
          deliveryNumber: String(
            updateData.deliveryNumber ?? currentOrder.deliveryNumber ?? "",
          ),
          deliveryNeighborhood: String(
            updateData.deliveryNeighborhood ??
              currentOrder.deliveryNeighborhood ??
              "",
          ),
          deliveryCity: String(
            updateData.deliveryCity ?? currentOrder.deliveryCity ?? "",
          ),
          deliveryState: String(
            updateData.deliveryState ?? currentOrder.deliveryState ?? "",
          ),
          deliveryCep: String(nextCep ?? ""),
          deliveryComplement: String(
            updateData.deliveryComplement ??
              currentOrder.deliveryComplement ??
              "",
          ),
          deliveryReference: String(
            updateData.deliveryReference ??
              currentOrder.deliveryReference ??
              "",
          ),
        }),
        customerCity: String(
          updateData.deliveryCity ?? currentOrder.deliveryCity ?? "",
        ),
      });
      updateData.estimatedDistanceKm = String(
        distanceResult.estimatedDistanceKm,
      );
      updateData.deliveryDistanceSource = distanceResult.source;
      updateData.deliveryFeeCalculated = String(
        distanceResult.deliveryFeeCalculated,
      );
      updateData.deliveryFeeSource = distanceResult.source;
      if (
        distanceResult.deliveryFeeCalculated &&
        distanceResult.deliveryFee != null
      ) {
        updateData.deliveryFee = String(distanceResult.deliveryFee);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(deliveryCalculationErrorStatus(error))
        .json({ error: message });
      return;
    }
  }

  await db
    .update(ordersTable)
    .set(updateData)
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

  if (["ready", "closed", "cancelled"].includes(order.status)) {
    res.status(409).json({
      error:
        "Não é possível adicionar itens a um pedido pronto, finalizado ou cancelado.",
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
        .innerJoin(
          addonGroupsTable,
          eq(addonOptionsTable.groupId, addonGroupsTable.id),
        )
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
      res
        .status(400)
        .json({ error: "Adicional não pertence a este produto/loja." });
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
    const minimum = group.required
      ? Math.max(1, group.minSelected)
      : group.minSelected;
    if (selectedCount < minimum) {
      res.status(400).json({
        error: `Selecione pelo menos ${minimum} opção(ões) em ${group.name}.`,
      });
      return;
    }
    if (group.maxSelected != null && selectedCount > group.maxSelected) {
      res.status(400).json({
        error: `Selecione no máximo ${group.maxSelected} opção(ões) em ${group.name}.`,
      });
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

      if (order.status === "preparing") {
        const [pendingTicket] = await tx
          .select({ id: kitchenTicketsTable.id })
          .from(kitchenTicketsTable)
          .where(
            and(
              eq(kitchenTicketsTable.orderId, params.data.id),
              eq(kitchenTicketsTable.status, "pending"),
            ),
          )
          .limit(1);
        if (!pendingTicket) {
          await tx
            .insert(kitchenTicketsTable)
            .values({ orderId: params.data.id, status: "pending" });
        }
      }

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
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Erro ao adicionar adicionais.",
    });
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

  const [order] = await db
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    )
    .limit(1);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const financial = await getOrderFinancialState(params.data.id);
  if (financial.paidAmount > 0) {
    res
      .status(409)
      .json({
        error:
          "Pedido já possui pagamento. Remoção exigirá ajuste/estorno manual.",
      });
    return;
  }
  if (order.status === "preparing") {
    res
      .status(409)
      .json({
        error:
          "Pedido já foi enviado para cozinha. Para remover item, cancele o pedido ou use ajuste manual.",
      });
    return;
  }
  if (order.status !== "open") {
    res
      .status(409)
      .json({
        error:
          "Pedido pronto, finalizado ou cancelado não permite remoção de item.",
      });
    return;
  }

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

  const [current] = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      type: ordersTable.type,
      deliveryStatus: ordersTable.deliveryStatus,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, params.data.id),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );

  if (!current) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (current.kitchenAcceptedAt) {
    res.status(409).json({ error: "Pedido já foi enviado para a cozinha." });
    return;
  }
  if (current.status !== "open") {
    res
      .status(409)
      .json({
        error: "Somente pedidos abertos podem ser enviados para a cozinha.",
      });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, params.data.id));
  if (Number(count) < 1) {
    res
      .status(400)
      .json({
        error: "Adicione pelo menos um item antes de enviar para a cozinha.",
      });
    return;
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(ordersTable)
      .set({
        status: "preparing",
        kitchenAcceptedAt: now,
        ...(current.type === "delivery" && current.deliveryStatus === "pending"
          ? { deliveryStatus: "preparing" }
          : {}),
      })
      .where(
        and(
          eq(ordersTable.id, params.data.id),
          eq(ordersTable.storeId, scope.actor.storeId),
        ),
      );

    const [ticket] = await tx
      .select({ id: kitchenTicketsTable.id })
      .from(kitchenTicketsTable)
      .where(
        and(
          eq(kitchenTicketsTable.orderId, params.data.id),
          inArray(kitchenTicketsTable.status, ["pending", "preparing"]),
        ),
      )
      .limit(1);
    if (!ticket)
      await tx
        .insert(kitchenTicketsTable)
        .values({ orderId: params.data.id, status: "pending" });
  });

  const order = await getOrderWithItems(params.data.id, scope.actor.storeId);
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

router.get("/orders/flow-anomalies", async (req, res): Promise<void> => {
  const scope = await requireOpenShift(req, res);
  if (!scope) return;
  const orders = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      deliveryStatus: ordersTable.deliveryStatus,
      paidAt: ordersTable.paidAt,
      closedAt: ordersTable.closedAt,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
      type: ordersTable.type,
      paymentTiming: ordersTable.paymentTiming,
    })
    .from(ordersTable)
    .where(eq(ordersTable.storeId, scope.actor.storeId));
  const anomalies = [];
  for (const order of orders) {
    const financial = await getOrderFinancialState(order.id);
    const [ticketCount] = await db
      .select({ count: sql<string>`count(*)` })
      .from(kitchenTicketsTable)
      .where(eq(kitchenTicketsTable.orderId, order.id));
    const [movementCount] = await db
      .select({ count: sql<string>`count(*)` })
      .from(cashMovementsTable)
      .where(eq(cashMovementsTable.orderId, order.id));
    const types: string[] = [];
    if (
      financial.paidAmount > 0 &&
      !order.kitchenAcceptedAt &&
      order.status !== "cancelled"
    )
      types.push("paid_but_not_sent_to_kitchen");
    if (order.status === "closed" && !order.closedAt)
      types.push("closed_without_closedAt");
    if (order.status === "closed" && financial.paidAmount <= 0)
      types.push("closed_without_payment");
    if (financial.paidAmount > 0 && !order.paidAt)
      types.push("payment_without_paidAt");
    if (Number(ticketCount.count) > 0 && !order.kitchenAcceptedAt)
      types.push("kitchen_ticket_without_kitchenAcceptedAt");
    if (order.status === "ready" && financial.outstandingAmount > 0)
      types.push("ready_with_outstanding_amount");
    if (order.status === "closed" && financial.outstandingAmount > 0)
      types.push("closed_with_outstanding_amount");
    if (order.status === "preparing" && financial.paidAmount > 0)
      types.push("preparing_with_paid_amount_and_no_financial_badge_data");
    if (
      order.type === "delivery" &&
      order.paymentTiming === "on_delivery" &&
      order.deliveryStatus === "delivered" &&
      financial.paidAmount <= 0
    )
      types.push("delivered_without_payment_when_on_delivery");
    for (const type of types)
      anomalies.push({
        orderId: order.id,
        type,
        financial,
        hasCashMovement: Number(movementCount.count) > 0,
      });
  }
  res.json(anomalies);
});

router.get("/orders/:id/flow-diagnostics", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const scope = await requireOpenShift(req, res);
  if (!scope) return;
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(eq(ordersTable.id, id), eq(ordersTable.storeId, scope.actor.storeId)),
    );
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado" });
    return;
  }
  const financial = await getOrderFinancialState(id);
  const [paymentsCount] = await db
    .select({ count: sql<string>`count(*)` })
    .from(paymentsTable)
    .where(eq(paymentsTable.orderId, id));
  const [movementsCount] = await db
    .select({ count: sql<string>`count(*)` })
    .from(cashMovementsTable)
    .where(eq(cashMovementsTable.orderId, id));
  const [ticketsCount] = await db
    .select({ count: sql<string>`count(*)` })
    .from(kitchenTicketsTable)
    .where(eq(kitchenTicketsTable.orderId, id));
  const canAddItem = ["open", "preparing"].includes(order.status);
  const canSendToKitchen = order.status === "open" && !order.kitchenAcceptedAt;
  const warnings = [];
  if (financial.paidAmount > 0 && !order.kitchenAcceptedAt)
    warnings.push(
      "Pedido já possui pagamento, mas ainda não foi enviado para cozinha.",
    );
  if (financial.outstandingAmount > 0 && financial.paidAmount > 0)
    warnings.push("Pedido possui valor complementar pendente.");
  res.json({
    orderId: id,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    paidAt: order.paidAt,
    closedAt: order.closedAt,
    ...financial,
    paymentsCount: Number(paymentsCount.count),
    hasCashMovement: Number(movementsCount.count) > 0,
    hasKitchenTicket: Number(ticketsCount.count) > 0,
    kitchenTicketsCount: Number(ticketsCount.count),
    canEdit: canAddItem,
    canAddItem,
    canRemoveItem: order.status === "open" && financial.paidAmount === 0,
    canSendToKitchen,
    canPay:
      financial.outstandingAmount > 0 &&
      !["cancelled", "closed"].includes(order.status),
    canFinalize: order.status === "ready" && financial.outstandingAmount <= 0,
    warnings,
  });
});

router.post(
  "/orders/:id/reopen-paid-for-kitchen",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const actor = await getCurrentActor(req);
    if (actor.role !== "max_control") {
      res
        .status(403)
        .json({
          error: "Apenas max_control pode reabrir pedidos legados pagos.",
        });
      return;
    }
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(
        and(eq(ordersTable.id, id), eq(ordersTable.storeId, actor.storeId)),
      );
    if (!order) {
      res.status(404).json({ error: "Pedido não encontrado" });
      return;
    }
    const financial = await getOrderFinancialState(id);
    if (
      order.status !== "closed" ||
      order.kitchenAcceptedAt ||
      (!order.paidAt && financial.paidAmount <= 0)
    ) {
      res
        .status(409)
        .json({ error: "Pedido não atende aos critérios de reparo legado." });
      return;
    }
    await db
      .update(ordersTable)
      .set({ status: "open" })
      .where(
        and(eq(ordersTable.id, id), eq(ordersTable.storeId, actor.storeId)),
      );
    res.json(await getOrderWithItems(id, actor.storeId));
  },
);

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

  const financial = await getOrderFinancialState(id);
  if (!["paid", "overpaid"].includes(financial.paymentState)) {
    res
      .status(400)
      .json({
        error: `Existe valor pendente de R$ ${financial.outstandingAmount.toFixed(2)}. Cobre a diferença antes de finalizar.`,
      });
    return;
  }

  const canCloseOperationally =
    order.status === "ready" ||
    (order.type === "delivery" &&
      ["delivered", "awaiting_settlement", "out_for_delivery"].includes(
        String(order.deliveryStatus),
      ));
  if (!canCloseOperationally) {
    res
      .status(400)
      .json({
        error:
          "Pedido ainda não está pronto. Finalize apenas depois da cozinha marcar como pronto.",
      });
    return;
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
