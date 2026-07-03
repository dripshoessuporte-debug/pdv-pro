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
  orderItemFlavorsTable,
  pizzaSizesTable,
  pizzaPriceTiersTable,
  pizzaSizeTierPricesTable,
  pizzaFlavorsTable,
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

function numberOrZero(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateToIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadOrdersErrorResponse(error: unknown): {
  error: string;
  details?: string;
} {
  return {
    error: "Erro ao carregar pedidos.",
    ...(isDevRuntime() ? { details: getErrorMessage(error) } : {}),
  };
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
      itemType: orderItemsTable.itemType,
      displayName: orderItemsTable.displayName,
      pizzaSizeName: orderItemsTable.pizzaSizeName,
      pricingMode: orderItemsTable.pricingMode,
      basePizzaTierName: orderItemsTable.basePizzaTierName,
    })
    .from(orderItemsTable)
    .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, orderId));

  const financial = await getOrderFinancialState(orderId).catch((error) => {
    console.error({ error, orderId }, "failed to load order financial state");
    return {
      totalAmount: numberOrZero(order.totalAmount),
      paidAmount: 0,
      outstandingAmount: numberOrZero(order.totalAmount),
      paymentState: "unpaid" as const,
    };
  });
  const { customerNameRegistered, ...orderRest } = order;
  return {
    ...orderRest,
    customerName: order.customerName ?? customerNameRegistered ?? null,
    totalAmount: financial.totalAmount,
    financial,
    paidAmount: financial.paidAmount,
    outstandingAmount: financial.outstandingAmount,
    paymentState: financial.paymentState,
    deliveryFee: numberOrZero(order.deliveryFee),
    needsChange:
      order.needsChange == null ? null : order.needsChange === "true",
    changeFor: order.changeFor ? numberOrZero(order.changeFor) : null,
    kitchenAcceptedAt: dateToIsoOrNull(order.kitchenAcceptedAt),
    readyAt: dateToIsoOrNull(order.readyAt),
    paidAt: dateToIsoOrNull(order.paidAt),
    closedAt: dateToIsoOrNull(order.closedAt),
    estimatedDistanceKm:
      order.estimatedDistanceKm != null
        ? numberOrZero(order.estimatedDistanceKm)
        : null,
    deliveryFeeCalculated: order.deliveryFeeCalculated === "true",
    createdAt: dateToIsoOrNull(order.createdAt) ?? new Date(0).toISOString(),
    updatedAt: dateToIsoOrNull(order.updatedAt) ?? undefined,
    items: await Promise.all(
      items.map(async (item) => ({
        ...item,
        productName: item.productName ?? item.displayName ?? "Produto removido",
        variantPrice: item.variantPrice
          ? numberOrZero(item.variantPrice)
          : null,
        unitPrice: numberOrZero(item.unitPrice),
        totalPrice: numberOrZero(item.totalPrice),
        addons: (
          await db
            .select()
            .from(orderItemAddonsTable)
            .where(eq(orderItemAddonsTable.orderItemId, item.id))
            .catch((error) => {
              console.error(
                { error, orderItemId: item.id },
                "failed to load order item addons",
              );
              return [];
            })
        ).map((addon) => ({
          ...addon,
          addonGroupName: addon.addonGroupName ?? "Adicionais",
          addonName: addon.addonName ?? "Adicional removido",
          addonPrice: numberOrZero(addon.addonPrice),
          totalPrice: numberOrZero(addon.totalPrice),
        })),
        flavors: (
          await db
            .select()
            .from(orderItemFlavorsTable)
            .where(eq(orderItemFlavorsTable.orderItemId, item.id))
            .catch((error) => {
              console.error(
                { error, orderItemId: item.id },
                "failed to load order item flavors",
              );
              return [];
            })
        ).map((flavor) => ({
          productId: flavor.productId,
          productName: flavor.productNameSnapshot,
          tierId: flavor.tierId,
          tierName: flavor.tierNameSnapshot,
          fractionNumerator: flavor.fractionNumerator,
          fractionDenominator: flavor.fractionDenominator,
        })),
      })),
    ),
  };
}

class OrderFlowError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type AddSimpleOrderItemInput = typeof AddOrderItemBody._type;

async function addSimpleOrderItem({
  orderId,
  data,
  storeId,
  orderStatus,
  client = db,
}: {
  orderId: number;
  data: AddSimpleOrderItemInput;
  storeId: number;
  orderStatus: string;
  client?: any;
}) {
  if (["ready", "closed", "cancelled"].includes(orderStatus)) {
    throw new OrderFlowError(
      "Não é possível adicionar itens a um pedido pronto, finalizado ou cancelado.",
      409,
    );
  }

  const [product] = await client
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, data.productId),
        eq(productsTable.storeId, storeId),
      ),
    );
  if (!product) {
    throw new OrderFlowError("Produto não encontrado nesta loja.", 404);
  }

  let unitPrice = parseFloat(String(product.price));
  let variantName: string | null = null;
  let variantPrice: number | null = null;
  let variantId: number | null = null;

  if (data.variantId != null) {
    const [variant] = await client
      .select()
      .from(productVariantsTable)
      .where(
        and(
          eq(productVariantsTable.id, data.variantId),
          eq(productVariantsTable.productId, data.productId),
          eq(productVariantsTable.storeId, storeId),
          eq(productVariantsTable.active, true),
          eq(productVariantsTable.available, true),
        ),
      );
    if (!variant) {
      throw new OrderFlowError("Variação inválida para este produto.");
    }
    unitPrice = parseFloat(String(variant.price));
    variantId = variant.id;
    variantName = variant.name;
    variantPrice = unitPrice;
  }

  const requestedAddons = (data.addons ?? []).map((addon) => ({
    addonOptionId: addon.addonOptionId,
    quantity: addon.quantity ?? 1,
  }));

  if (requestedAddons.some((addon) => addon.quantity < 1)) {
    throw new OrderFlowError("Quantidade de adicional deve ser >= 1.");
  }

  const linkedGroups = await client
    .select({ group: addonGroupsTable })
    .from(productAddonGroupsTable)
    .innerJoin(
      addonGroupsTable,
      eq(productAddonGroupsTable.addonGroupId, addonGroupsTable.id),
    )
    .where(
      and(
        eq(productAddonGroupsTable.productId, data.productId),
        eq(productAddonGroupsTable.storeId, storeId),
        eq(addonGroupsTable.storeId, storeId),
        eq(addonGroupsTable.active, true),
      ),
    );
  const allowedGroupIds = new Set(linkedGroups.map((row: any) => row.group.id));
  const addonOptionIds = requestedAddons.map((addon) => addon.addonOptionId);
  const addonRows = addonOptionIds.length
    ? await client
        .select({ option: addonOptionsTable, group: addonGroupsTable })
        .from(addonOptionsTable)
        .innerJoin(
          addonGroupsTable,
          eq(addonOptionsTable.groupId, addonGroupsTable.id),
        )
        .where(
          and(
            eq(addonOptionsTable.storeId, storeId),
            inArray(addonOptionsTable.id, addonOptionIds),
            eq(addonOptionsTable.available, true),
            eq(addonGroupsTable.active, true),
          ),
        )
    : [];

  if (addonRows.length !== new Set(addonOptionIds).size) {
    throw new OrderFlowError("Adicional inválido para este produto.");
  }

  const addonById = new Map(addonRows.map((row: any) => [row.option.id, row]));
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
    const row = addonById.get(requested.addonOptionId) as any;
    if (!row || !allowedGroupIds.has(row.group.id)) {
      throw new OrderFlowError("Adicional inválido para este produto.");
    }
    selectedByGroup.set(
      row.group.id,
      (selectedByGroup.get(row.group.id) ?? 0) + requested.quantity,
    );
    const addonPrice = parseFloat(String(row.option.price));
    const total = addonPrice * requested.quantity * data.quantity;
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
      ? Math.max(1, group.minSelected ?? 0)
      : 0;
    if (selectedCount < minimum) {
      throw new OrderFlowError(
        `Selecione pelo menos ${minimum} opção(ões) em ${group.name}.`,
      );
    }
    if (group.maxSelected != null && selectedCount > group.maxSelected) {
      throw new OrderFlowError(
        `Selecione no máximo ${group.maxSelected} opção(ões) em ${group.name}.`,
      );
    }
  }

  const totalUnitPrice = unitPrice + addonsTotal;
  const totalPrice = totalUnitPrice * data.quantity;
  const [item] = await client
    .insert(orderItemsTable)
    .values({
      orderId,
      productId: data.productId,
      variantId,
      variantName,
      variantPrice: variantPrice != null ? String(variantPrice) : null,
      quantity: data.quantity,
      unitPrice: String(totalUnitPrice),
      totalPrice: String(totalPrice),
      notes: data.notes,
    })
    .returning();

  if (addonSnapshots.length) {
    await client.insert(orderItemAddonsTable).values(
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

  await recalcOrderTotal(orderId, client);

  if (orderStatus === "preparing") {
    const [pendingTicket] = await client
      .select({ id: kitchenTicketsTable.id })
      .from(kitchenTicketsTable)
      .where(
        and(
          eq(kitchenTicketsTable.orderId, orderId),
          eq(kitchenTicketsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (!pendingTicket) {
      await client
        .insert(kitchenTicketsTable)
        .values({ orderId, status: "pending" });
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

  try {
    const conditions = [eq(ordersTable.storeId, scope.actor.storeId)];
    if (status) conditions.push(eq(ordersTable.status, status));
    if (tableId) conditions.push(eq(ordersTable.tableId, tableId));
    if (scope.actor.role === "atendente" && scope.openedAt) {
      conditions.push(gte(ordersTable.createdAt, scope.openedAt));
    }

    const orders = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(...conditions))
      .orderBy(sql`${ordersTable.createdAt} DESC`)
      .limit(100);

    const ordersWithItems = (
      await Promise.all(
        orders.map(async (order) => {
          try {
            return await getOrderWithItems(order.id, scope.actor.storeId);
          } catch (error) {
            req.log.error(
              { error, orderId: order.id, storeId: scope.actor.storeId },
              "failed to hydrate order for list",
            );
            return null;
          }
        }),
      )
    ).filter((order): order is NonNullable<typeof order> => order != null);

    const parsed = ListOrdersResponse.safeParse(ordersWithItems);
    if (!parsed.success) {
      req.log.error(
        { error: parsed.error.flatten(), storeId: scope.actor.storeId },
        "list orders response schema mismatch",
      );
      res.json(ordersWithItems);
      return;
    }

    res.json(parsed.data);
  } catch (error) {
    req.log.error(
      { error, storeId: scope.actor.storeId },
      "failed to list orders",
    );
    res.status(500).json(loadOrdersErrorResponse(error));
  }
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
    items,
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

  try {
    const order = await db.transaction(async (tx) => {
      const [createdOrder] = await tx
        .insert(ordersTable)
        .values({
          ...restData,
          storeId,
          cashRegisterId: scope.cashRegisterId,
          deliveryFee: String(fee),
          totalAmount: String(fee),
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

      if (parsed.data.tableId) {
        await tx
          .update(tablesTable)
          .set({ status: "occupied", currentOrderId: createdOrder.id })
          .where(
            and(
              eq(tablesTable.id, parsed.data.tableId),
              eq(tablesTable.storeId, storeId),
            ),
          );
      }

      for (const item of items ?? []) {
        await addSimpleOrderItem({
          orderId: createdOrder.id,
          data: item,
          storeId,
          orderStatus: createdOrder.status,
          client: tx,
        });
      }

      return createdOrder;
    });

    try {
      const full = await getOrderWithItems(order.id, storeId);
      if (!full) {
        req.log.error(
          { orderId: order.id, storeId },
          "created order not found while hydrating response",
        );
        res.status(500).json({ error: "Erro ao criar pedido." });
        return;
      }

      const response = GetOrderResponse.safeParse(full);
      if (!response.success) {
        req.log.error(
          { error: response.error.flatten(), orderId: order.id, storeId },
          "created order response schema mismatch",
        );
        res.status(201).json(full);
        return;
      }

      res.status(201).json(response.data);
    } catch (error) {
      req.log.error(
        { error, orderId: order.id, storeId },
        "failed to hydrate created order response",
      );
      res.status(500).json(createOrderErrorResponse(error));
    }
  } catch (error) {
    req.log.error({ error }, "failed to create order");
    const status = error instanceof OrderFlowError ? error.status : 500;
    res
      .status(status)
      .json(
        error instanceof OrderFlowError
          ? { error: error.message }
          : createOrderErrorResponse(error),
      );
    return;
  }
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

  try {
    const itemWithName = await db.transaction((tx) =>
      addSimpleOrderItem({
        orderId: params.data.id,
        data: parsed.data,
        storeId: scope.actor.storeId,
        orderStatus: order.status,
        client: tx,
      }),
    );

    res.status(201).json(itemWithName);
  } catch (error) {
    req.log.error({ error }, "failed to add order item");
    const status = error instanceof OrderFlowError ? error.status : 400;
    res.status(status).json({
      error:
        error instanceof Error
          ? error.message
          : "Erro ao adicionar item ao pedido.",
    });
  }
});

router.post("/orders/:id/pizza-items", async (req, res): Promise<void> => {
  const orderId = Number(req.params.id);
  const baseProductId = Number(req.body.baseProductId);
  const pizzaSizeId = Number(req.body.pizzaSizeId);
  const flavorProductIds: number[] = Array.isArray(req.body.flavorProductIds)
    ? req.body.flavorProductIds
        .map(Number)
        .filter((id: number) => Number.isInteger(id) && id > 0)
    : [];
  const quantity = Number(req.body.quantity ?? 1);
  if (
    !orderId ||
    !baseProductId ||
    !pizzaSizeId ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    flavorProductIds.length < 1
  ) {
    res.status(400).json({ error: "Dados da pizza inválidos." });
    return;
  }
  const scope = await requireOpenShift(req, res);
  if (!scope) return;
  const storeId = scope.actor.storeId;
  const [order] = await db
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId)))
    .limit(1);
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
  const [baseProduct] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, baseProductId),
        eq(productsTable.storeId, storeId),
        eq(productsTable.active, true),
        eq(productsTable.available, true),
      ),
    )
    .limit(1);
  if (!baseProduct) {
    res.status(400).json({ error: "Produto base inválido para esta loja." });
    return;
  }
  const [size] = await db
    .select()
    .from(pizzaSizesTable)
    .where(
      and(
        eq(pizzaSizesTable.id, pizzaSizeId),
        eq(pizzaSizesTable.storeId, storeId),
        eq(pizzaSizesTable.active, true),
      ),
    )
    .limit(1);
  if (!size) {
    res.status(400).json({ error: "Tamanho inválido para esta loja." });
    return;
  }
  if (flavorProductIds.length > size.maxFlavors) {
    res
      .status(400)
      .json({ error: `Selecione no máximo ${size.maxFlavors} sabor(es).` });
    return;
  }
  const uniqueFlavorIds = [...new Set(flavorProductIds)];
  const rows = await db
    .select({
      flavor: pizzaFlavorsTable,
      product: productsTable,
      tier: pizzaPriceTiersTable,
      price: pizzaSizeTierPricesTable.price,
    })
    .from(pizzaFlavorsTable)
    .innerJoin(productsTable, eq(pizzaFlavorsTable.productId, productsTable.id))
    .innerJoin(
      pizzaPriceTiersTable,
      eq(pizzaFlavorsTable.tierId, pizzaPriceTiersTable.id),
    )
    .leftJoin(
      pizzaSizeTierPricesTable,
      and(
        eq(pizzaSizeTierPricesTable.storeId, storeId),
        eq(pizzaSizeTierPricesTable.sizeId, pizzaSizeId),
        eq(pizzaSizeTierPricesTable.tierId, pizzaFlavorsTable.tierId),
      ),
    )
    .where(
      and(
        eq(pizzaFlavorsTable.storeId, storeId),
        inArray(pizzaFlavorsTable.productId, uniqueFlavorIds),
        eq(pizzaFlavorsTable.active, true),
        eq(productsTable.storeId, storeId),
        eq(pizzaPriceTiersTable.storeId, storeId),
      ),
    );
  if (rows.length !== uniqueFlavorIds.length) {
    res
      .status(400)
      .json({ error: "Sabor sem classificação ativa ou de outra loja." });
    return;
  }
  if (rows.some((r) => r.price == null)) {
    res
      .status(400)
      .json({ error: "Classificação sem preço para este tamanho." });
    return;
  }
  const priced = rows
    .map((r) => ({ ...r, numericPrice: parseFloat(String(r.price)) }))
    .sort((a, b) => b.numericPrice - a.numericPrice);
  const highest = priced[0];
  const unitPrice = highest.numericPrice;
  const totalPrice = unitPrice * quantity;
  const displayName = `Pizza ${size.name} — ${flavorProductIds.length} sabor${flavorProductIds.length > 1 ? "es" : ""}`;
  const fractionDenominator = flavorProductIds.length;
  const created = await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(orderItemsTable)
      .values({
        orderId,
        productId: baseProductId,
        quantity,
        unitPrice: String(unitPrice),
        totalPrice: String(totalPrice),
        notes: req.body.notes ?? null,
        itemType: "pizza_multi_flavor",
        displayName,
        pizzaSizeId,
        pizzaSizeName: size.name,
        pricingMode: "highest_tier",
        basePizzaTierId: highest.tier.id,
        basePizzaTierName: highest.tier.name,
      })
      .returning();
    await tx.insert(orderItemFlavorsTable).values(
      flavorProductIds.map((pid: number, index: number) => {
        const row = rows.find((r) => r.product.id === pid)!;
        return {
          orderItemId: item.id,
          productId: pid,
          productNameSnapshot: row.product.name,
          tierId: row.tier.id,
          tierNameSnapshot: row.tier.name,
          fractionNumerator: 1,
          fractionDenominator,
          sortOrder: index,
        };
      }),
    );
    await recalcOrderTotal(orderId, tx);
    if (order.status === "preparing") {
      const [pendingTicket] = await tx
        .select({ id: kitchenTicketsTable.id })
        .from(kitchenTicketsTable)
        .where(
          and(
            eq(kitchenTicketsTable.orderId, orderId),
            eq(kitchenTicketsTable.status, "pending"),
          ),
        )
        .limit(1);
      if (!pendingTicket)
        await tx
          .insert(kitchenTicketsTable)
          .values({ orderId, status: "pending" });
    }
    return item;
  });
  res.status(201).json({
    ...created,
    productName: baseProduct.name,
    unitPrice,
    totalPrice,
    addons: [],
    flavors: flavorProductIds.map((pid: number) => {
      const row = rows.find((r) => r.product.id === pid)!;
      return {
        productId: pid,
        productName: row.product.name,
        tierId: row.tier.id,
        tierName: row.tier.name,
        fractionNumerator: 1,
        fractionDenominator,
      };
    }),
  });
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
    res.status(409).json({
      error:
        "Pedido já possui pagamento. Remoção exigirá ajuste/estorno manual.",
    });
    return;
  }
  if (order.status === "preparing") {
    res.status(409).json({
      error:
        "Pedido já foi enviado para cozinha. Para remover item, cancele o pedido ou use ajuste manual.",
    });
    return;
  }
  if (order.status !== "open") {
    res.status(409).json({
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
    res.status(409).json({
      error: "Somente pedidos abertos podem ser enviados para a cozinha.",
    });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, params.data.id));
  if (Number(count) < 1) {
    res.status(400).json({
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
      res.status(403).json({
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
    res.status(400).json({
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
    res.status(400).json({
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
