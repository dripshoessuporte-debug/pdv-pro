import { Router, type IRouter } from "express";
import { desc, eq, sql, and, gte, inArray } from "drizzle-orm";
import {
  db,
  kitchenTicketsTable,
  ordersTable,
  tablesTable,
  orderItemsTable,
  productsTable,
  customersTable,
  orderItemAddonsTable,
  orderItemFlavorsTable,
  deliveryRouteOrdersTable,
} from "@workspace/db";
import {
  MarkTicketReadyParams,
  GetKitchenQueueResponse,
  MarkTicketReadyResponse,
  BulkReadyKitchenTicketsBody,
  BulkReadyKitchenTicketsResponse,
  BulkCancelKitchenTicketsBody,
  BulkCancelKitchenTicketsResponse,
} from "@workspace/api-zod";
import { getOperationalSessionStart } from "../lib/operational-session";
import { getCurrentActor } from "../middleware/rbac";
import { releaseTableIfOrderClosed } from "../lib/table-release";

const router: IRouter = Router();

function isDevRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logRoutePerformance(
  req: {
    log?: {
      info?: (data: object, message: string) => void;
      warn?: (data: object, message: string) => void;
    };
  },
  data: {
    route: string;
    storeId: number;
    durationMs: number;
    ticketCount?: number;
    itemCount?: number;
  },
) {
  if (data.durationMs > 1000) {
    req.log?.warn?.(data, "slow operational route");
  } else if (isDevRuntime()) {
    req.log?.info?.(data, "operational route performance");
  }
}

type TicketOrderRecord = {
  id: number;
  orderId: number;
  ticketStatus: string;
  orderStatus: string;
  orderType: string;
  paidAt: Date | null;
  deliveryStatus: string | null;
};

function uniqueTicketIds(ticketIds: number[]) {
  return Array.from(new Set(ticketIds));
}

async function getScopedTickets(ticketIds: number[], storeId: number) {
  if (ticketIds.length === 0) return [];

  return db
    .select({
      id: kitchenTicketsTable.id,
      orderId: kitchenTicketsTable.orderId,
      ticketStatus: kitchenTicketsTable.status,
      orderStatus: ordersTable.status,
      orderType: ordersTable.type,
      paidAt: ordersTable.paidAt,
      deliveryStatus: ordersTable.deliveryStatus,
    })
    .from(kitchenTicketsTable)
    .innerJoin(ordersTable, eq(kitchenTicketsTable.orderId, ordersTable.id))
    .where(
      and(
        inArray(kitchenTicketsTable.id, ticketIds),
        eq(ordersTable.storeId, storeId),
      ),
    );
}

function validateBulkTickets(
  records: TicketOrderRecord[],
  ticketIds: number[],
) {
  const foundIds = new Set(records.map((ticket) => ticket.id));
  const missingIds = ticketIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    return { status: 404, error: "Ticket not found", ticketIds: missingIds };
  }

  const invalidTickets = records.filter(
    (ticket) =>
      ticket.ticketStatus !== "pending" || ticket.orderStatus === "cancelled",
  );
  if (invalidTickets.length > 0) {
    return {
      status: 409,
      error: "Ticket is not pending or order is cancelled",
      ticketIds: invalidTickets.map((ticket) => ticket.id),
    };
  }

  return null;
}

async function getTicketWithItems(ticketId: number, storeId?: number) {
  const [ticket] = await db
    .select({
      id: kitchenTicketsTable.id,
      orderId: kitchenTicketsTable.orderId,
      tableNumber: tablesTable.number,
      orderType: ordersTable.type,
      status: kitchenTicketsTable.status,
      notes: ordersTable.notes,
      customerName: sql<
        string | null
      >`coalesce(${ordersTable.customerName}, ${customersTable.name})`,
      orderCreatedAt: ordersTable.createdAt,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
      ticketCreatedAt: kitchenTicketsTable.createdAt,
      createdAt: kitchenTicketsTable.createdAt,
    })
    .from(kitchenTicketsTable)
    .leftJoin(ordersTable, eq(kitchenTicketsTable.orderId, ordersTable.id))
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
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
      variantId: orderItemsTable.variantId,
      variantName: orderItemsTable.variantName,
      variantPrice: orderItemsTable.variantPrice,
      itemType: orderItemsTable.itemType,
      displayName: orderItemsTable.displayName,
      pizzaSizeName: orderItemsTable.pizzaSizeName,
    })
    .from(orderItemsTable)
    .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, ticket.orderId));

  return {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    orderCreatedAt: ticket.orderCreatedAt?.toISOString() ?? null,
    kitchenAcceptedAt: ticket.kitchenAcceptedAt?.toISOString() ?? null,
    ticketCreatedAt:
      ticket.ticketCreatedAt?.toISOString() ?? ticket.createdAt.toISOString(),
    items: await Promise.all(
      items.map(async (item) => ({
        ...item,
        unitPrice: parseFloat(String(item.unitPrice)),
        totalPrice: parseFloat(String(item.totalPrice)),
        variantPrice:
          item.variantPrice == null
            ? null
            : parseFloat(String(item.variantPrice)),
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
        flavors: (
          await db
            .select()
            .from(orderItemFlavorsTable)
            .where(eq(orderItemFlavorsTable.orderItemId, item.id))
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

router.get("/kitchen/queue", async (req, res): Promise<void> => {
  const startedAt = Date.now();
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
      customerName: sql<
        string | null
      >`coalesce(${ordersTable.customerName}, ${customersTable.name})`,
      orderCreatedAt: ordersTable.createdAt,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
      ticketCreatedAt: kitchenTicketsTable.createdAt,
      createdAt: kitchenTicketsTable.createdAt,
    })
    .from(kitchenTicketsTable)
    .leftJoin(ordersTable, eq(kitchenTicketsTable.orderId, ordersTable.id))
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(
      and(
        eq(kitchenTicketsTable.status, "pending"),
        eq(ordersTable.storeId, actor.storeId),
        gte(ordersTable.createdAt, operationalStart),
      ),
    )
    .orderBy(desc(kitchenTicketsTable.createdAt));

  const orderIds = tickets.map((ticket) => ticket.orderId);
  const items = orderIds.length
    ? await db
        .select({
          id: orderItemsTable.id,
          orderId: orderItemsTable.orderId,
          productId: orderItemsTable.productId,
          productName: sql<
            string | null
          >`coalesce(${orderItemsTable.displayName}, ${orderItemsTable.externalProductName}, ${productsTable.name})`,
          quantity: orderItemsTable.quantity,
          unitPrice: orderItemsTable.unitPrice,
          totalPrice: orderItemsTable.totalPrice,
          notes: orderItemsTable.notes,
          variantId: orderItemsTable.variantId,
          variantName: orderItemsTable.variantName,
          variantPrice: orderItemsTable.variantPrice,
          itemType: orderItemsTable.itemType,
          displayName: orderItemsTable.displayName,
          pizzaSizeName: orderItemsTable.pizzaSizeName,
        })
        .from(orderItemsTable)
        .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
        .leftJoin(
          productsTable,
          eq(orderItemsTable.productId, productsTable.id),
        )
        .where(
          and(
            inArray(orderItemsTable.orderId, orderIds),
            eq(ordersTable.storeId, actor.storeId),
          ),
        )
    : [];
  const itemIds = items.map((item) => item.id);
  const [addons, flavors] = itemIds.length
    ? await Promise.all([
        db
          .select({ addon: orderItemAddonsTable })
          .from(orderItemAddonsTable)
          .innerJoin(
            orderItemsTable,
            eq(orderItemAddonsTable.orderItemId, orderItemsTable.id),
          )
          .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
          .where(
            and(
              inArray(orderItemAddonsTable.orderItemId, itemIds),
              eq(ordersTable.storeId, actor.storeId),
            ),
          ),
        db
          .select({ flavor: orderItemFlavorsTable })
          .from(orderItemFlavorsTable)
          .innerJoin(
            orderItemsTable,
            eq(orderItemFlavorsTable.orderItemId, orderItemsTable.id),
          )
          .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
          .where(
            and(
              inArray(orderItemFlavorsTable.orderItemId, itemIds),
              eq(ordersTable.storeId, actor.storeId),
            ),
          ),
      ])
    : [[], []];
  const addonsByItemId = new Map<
    number,
    Array<typeof orderItemAddonsTable.$inferSelect>
  >();
  for (const row of addons) {
    const list = addonsByItemId.get(row.addon.orderItemId) ?? [];
    list.push(row.addon);
    addonsByItemId.set(row.addon.orderItemId, list);
  }
  const flavorsByItemId = new Map<
    number,
    Array<typeof orderItemFlavorsTable.$inferSelect>
  >();
  for (const row of flavors) {
    const list = flavorsByItemId.get(row.flavor.orderItemId) ?? [];
    list.push(row.flavor);
    flavorsByItemId.set(row.flavor.orderItemId, list);
  }
  const itemsByOrderId = new Map<number, Array<(typeof items)[number]>>();
  for (const item of items) {
    const list = itemsByOrderId.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrderId.set(item.orderId, list);
  }

  const ticketsWithItems = tickets.map((ticket) => ({
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    orderCreatedAt: ticket.orderCreatedAt?.toISOString() ?? null,
    kitchenAcceptedAt: ticket.kitchenAcceptedAt?.toISOString() ?? null,
    ticketCreatedAt:
      ticket.ticketCreatedAt?.toISOString() ?? ticket.createdAt.toISOString(),
    items: (itemsByOrderId.get(ticket.orderId) ?? []).map((item) => ({
      ...item,
      unitPrice: parseFloat(String(item.unitPrice)),
      totalPrice: parseFloat(String(item.totalPrice)),
      variantPrice:
        item.variantPrice == null
          ? null
          : parseFloat(String(item.variantPrice)),
      addons: (addonsByItemId.get(item.id) ?? []).map((addon) => ({
        ...addon,
        addonPrice: parseFloat(String(addon.addonPrice)),
        totalPrice: parseFloat(String(addon.totalPrice)),
      })),
      flavors: (flavorsByItemId.get(item.id) ?? []).map((flavor) => ({
        productId: flavor.productId,
        productName: flavor.productNameSnapshot,
        tierId: flavor.tierId,
        tierName: flavor.tierNameSnapshot,
        fractionNumerator: flavor.fractionNumerator,
        fractionDenominator: flavor.fractionDenominator,
      })),
    })),
  }));

  logRoutePerformance(req, {
    route: "/kitchen/queue",
    storeId: actor.storeId,
    ticketCount: ticketsWithItems.length,
    itemCount: items.length,
    durationMs: Date.now() - startedAt,
  });

  res.json(GetKitchenQueueResponse.parse(ticketsWithItems));
});

router.post("/kitchen/tickets/bulk-ready", async (req, res): Promise<void> => {
  const parsed = BulkReadyKitchenTicketsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actor = await getCurrentActor(req);
  const ticketIds = uniqueTicketIds(parsed.data.ticketIds);
  const scopedTickets = await getScopedTickets(ticketIds, actor.storeId);
  const validationError = validateBulkTickets(scopedTickets, ticketIds);
  if (validationError) {
    res.status(validationError.status).json({
      error: validationError.error,
      ticketIds: validationError.ticketIds,
    });
    return;
  }

  const readyAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(kitchenTicketsTable)
      .set({ status: "ready" })
      .where(inArray(kitchenTicketsTable.id, ticketIds));

    for (const ticket of scopedTickets) {
      const orderUpdate: {
        status?: string;
        deliveryStatus?: string;
        readyAt: Date;
      } = {
        readyAt,
      };

      if (!ticket.paidAt && ticket.orderStatus !== "closed") {
        orderUpdate.status = "ready";
      }

      if (
        ticket.orderType === "delivery" &&
        ticket.deliveryStatus !== "platform_delivery"
      ) {
        orderUpdate.deliveryStatus = "ready";
      }

      await tx
        .update(ordersTable)
        .set(orderUpdate)
        .where(
          and(
            eq(ordersTable.id, ticket.orderId),
            eq(ordersTable.storeId, actor.storeId),
          ),
        );
    }
  });

  res.json(
    BulkReadyKitchenTicketsResponse.parse({
      updatedCount: scopedTickets.length,
      ticketIds,
    }),
  );
});

router.post("/kitchen/tickets/bulk-cancel", async (req, res): Promise<void> => {
  const parsed = BulkCancelKitchenTicketsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actor = await getCurrentActor(req);
  const ticketIds = uniqueTicketIds(parsed.data.ticketIds);
  const scopedTickets = await getScopedTickets(ticketIds, actor.storeId);
  const validationError = validateBulkTickets(scopedTickets, ticketIds);
  if (validationError) {
    res.status(validationError.status).json({
      error: validationError.error,
      ticketIds: validationError.ticketIds,
    });
    return;
  }

  const orderIds = scopedTickets.map((ticket) => ticket.orderId);

  await db.transaction(async (tx) => {
    await tx
      .update(kitchenTicketsTable)
      .set({ status: "cancelled" })
      .where(inArray(kitchenTicketsTable.id, ticketIds));

    await tx
      .update(ordersTable)
      .set({
        status: "cancelled",
        deliveryStatus: null,
        notes: sql`concat_ws(E'\n', ${ordersTable.notes}, ${`Cancelamento cozinha: ${parsed.data.reason}`})`,
      })
      .where(
        and(
          inArray(ordersTable.id, orderIds),
          eq(ordersTable.storeId, actor.storeId),
        ),
      );

    await tx
      .delete(deliveryRouteOrdersTable)
      .where(inArray(deliveryRouteOrdersTable.orderId, orderIds));
  });

  await Promise.all(
    orderIds.map((orderId) => releaseTableIfOrderClosed(orderId)),
  );

  res.json(
    BulkCancelKitchenTicketsResponse.parse({
      cancelledCount: scopedTickets.length,
      ticketIds,
      orderIds,
    }),
  );
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
      deliveryStatus: ordersTable.deliveryStatus,
    })
    .from(ordersTable)
    .where(eq(ordersTable.id, ticket.orderId));

  const orderUpdate: {
    status?: string;
    deliveryStatus?: string;
    readyAt?: Date;
  } = {
    readyAt: new Date(),
  };

  if (order?.status !== "closed" && order?.status !== "cancelled") {
    orderUpdate.status = "ready";
  }

  // For delivery orders, advance deliveryStatus to 'ready' (pronto para entrega)
  // regardless of payment status — needed for route/delivery tracking.
  if (
    order?.type === "delivery" &&
    order.deliveryStatus !== "platform_delivery"
  ) {
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
