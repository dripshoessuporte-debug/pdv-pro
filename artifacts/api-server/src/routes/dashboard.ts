import { Router, type IRouter } from "express";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  tablesTable,
  kitchenTicketsTable,
  orderItemsTable,
  productsTable,
  categoriesTable,
  customersTable,
  paymentsTable,
  orderItemFlavorsTable,
} from "@workspace/db";

import {
  GetDashboardSummaryResponse,
  GetRecentOrdersResponse,
  GetSalesByCategoryResponse,
} from "@workspace/api-zod";
import { getOperationalSessionStart } from "../lib/operational-session";
import { getCurrentActor } from "../middleware/rbac";

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
    orderCount?: number;
    itemCount?: number;
  },
) {
  if (data.durationMs > 1000) {
    req.log?.warn?.(data, "slow operational route");
  } else if (isDevRuntime()) {
    req.log?.info?.(data, "operational route performance");
  }
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const startedAt = Date.now();
  const actor = await getCurrentActor(req);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const operationalStart = await getOperationalSessionStart();

  const [revenueToday] = await db
    .select({ total: sql<string>`coalesce(sum(${paymentsTable.amount}), 0)` })
    .from(paymentsTable)
    .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.storeId, actor.storeId),
        gte(paymentsTable.createdAt, operationalStart),
        eq(paymentsTable.status, "approved"),
      ),
    );

  const [countToday] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.storeId, actor.storeId),
        gte(ordersTable.createdAt, today),
        sql`${ordersTable.status} != 'cancelled'`,
      ),
    );

  const [openOrders] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.storeId, actor.storeId),
        gte(ordersTable.createdAt, operationalStart),
        sql`${ordersTable.status} in ('open', 'preparing', 'ready')`,
        sql`NOT (
          ${ordersTable.type} = 'delivery'
          AND ${ordersTable.deliveryStatus} IN (
            'out_for_delivery', 'delivered', 'awaiting_settlement', 'closed', 'cancelled'
          )
        )`,
      ),
    );

  const [awaitingSettlement] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.storeId, actor.storeId),
        eq(ordersTable.deliveryStatus, "awaiting_settlement"),
      ),
    );

  const [occupiedTables] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tablesTable)
    .where(
      and(
        eq(tablesTable.storeId, actor.storeId),
        eq(tablesTable.status, "occupied"),
      ),
    );

  const [availableTables] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tablesTable)
    .where(
      and(
        eq(tablesTable.storeId, actor.storeId),
        eq(tablesTable.status, "available"),
      ),
    );

  const [pendingTickets] = await db
    .select({ count: sql<number>`count(*)` })
    .from(kitchenTicketsTable)
    .innerJoin(ordersTable, eq(kitchenTicketsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(kitchenTicketsTable.status, "pending"),
        eq(ordersTable.storeId, actor.storeId),
        gte(ordersTable.createdAt, operationalStart),
      ),
    );

  const summary = {
    totalOrdersToday: Number(countToday?.count ?? 0),
    totalRevenueToday: parseFloat(String(revenueToday?.total ?? 0)),
    openOrders: Number(openOrders?.count ?? 0),
    occupiedTables: Number(occupiedTables?.count ?? 0),
    availableTables: Number(availableTables?.count ?? 0),
    pendingKitchenTickets: Number(pendingTickets?.count ?? 0),
    awaitingSettlement: Number(awaitingSettlement?.count ?? 0),
  };
  logRoutePerformance(req, {
    route: "/dashboard/summary",
    storeId: actor.storeId,
    durationMs: Date.now() - startedAt,
  });

  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/recent-orders", async (req, res): Promise<void> => {
  const startedAt = Date.now();
  const actor = await getCurrentActor(req);
  const operationalStart = await getOperationalSessionStart();
  const orders = await db
    .select({
      id: ordersTable.id,
      tableId: ordersTable.tableId,
      tableNumber: tablesTable.number,
      customerId: ordersTable.customerId,
      customerName: sql<
        string | null
      >`coalesce(${ordersTable.customerName}, ${customersTable.name})`,
      status: ordersTable.status,
      type: ordersTable.type,
      notes: ordersTable.notes,
      totalAmount: ordersTable.totalAmount,
      deliveryFee: ordersTable.deliveryFee,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
    })
    .from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(
      and(
        eq(ordersTable.storeId, actor.storeId),
        gte(ordersTable.createdAt, operationalStart),
      ),
    )
    .orderBy(sql`${ordersTable.createdAt} DESC`)
    .limit(10);

  const orderIds = orders.map((order) => order.id);
  const items = orderIds.length
    ? await db
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
  const itemsByOrderId = new Map<number, Array<(typeof items)[number]>>();
  for (const item of items) {
    const list = itemsByOrderId.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrderId.set(item.orderId, list);
  }

  const ordersWithItems = orders.map((order) => ({
    ...order,
    totalAmount: parseFloat(String(order.totalAmount)),
    deliveryFee: parseFloat(String(order.deliveryFee ?? "0")),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: (itemsByOrderId.get(order.id) ?? []).map((item) => ({
      ...item,
      unitPrice: parseFloat(String(item.unitPrice)),
      totalPrice: parseFloat(String(item.totalPrice)),
    })),
  }));

  logRoutePerformance(req, {
    route: "/dashboard/recent-orders",
    storeId: actor.storeId,
    orderCount: ordersWithItems.length,
    itemCount: items.length,
    durationMs: Date.now() - startedAt,
  });

  res.json(GetRecentOrdersResponse.parse(ordersWithItems));
});

router.get("/dashboard/sales-by-category", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const operationalStart = await getOperationalSessionStart();

  const categoryIdSql = sql<number>`
    case
      when ${orderItemsTable.itemType} = 'multisabor'
        then coalesce(first_flavor_category.category_id, -1)
      else coalesce(product_category.id, -2)
    end
  `;
  const categoryNameSql = sql<string>`
    case
      when ${orderItemsTable.itemType} = 'multisabor'
        then coalesce(first_flavor_category.category_name, 'Multisabor')
      else coalesce(product_category.name, 'Sem categoria')
    end
  `;

  const rows = await db.execute(sql`
    select
      ${categoryIdSql} as "categoryId",
      ${categoryNameSql} as "categoryName",
      coalesce(sum(${orderItemsTable.totalPrice}), 0) as "totalSales",
      count(${orderItemsTable.id}) as "itemCount"
    from ${orderItemsTable}
    inner join ${ordersTable}
      on ${orderItemsTable.orderId} = ${ordersTable.id}
    left join ${productsTable}
      on ${orderItemsTable.productId} = ${productsTable.id}
    left join ${categoriesTable} as product_category
      on ${productsTable.categoryId} = product_category.id
    left join lateral (
      select
        flavor_category.id as category_id,
        flavor_category.name as category_name
      from ${orderItemFlavorsTable}
      inner join ${productsTable} as flavor_product
        on ${orderItemFlavorsTable.productId} = flavor_product.id
      left join ${categoriesTable} as flavor_category
        on flavor_product.category_id = flavor_category.id
      where ${orderItemFlavorsTable.orderItemId} = ${orderItemsTable.id}
      order by ${orderItemFlavorsTable.sortOrder} asc, ${orderItemFlavorsTable.id} asc
      limit 1
    ) as first_flavor_category on true
    where
      ${ordersTable.storeId} = ${actor.storeId}
      and ${ordersTable.createdAt} >= ${operationalStart}
      and exists (
        select 1
        from ${paymentsTable}
        where ${paymentsTable.orderId} = ${ordersTable.id}
          and ${paymentsTable.createdAt} >= ${operationalStart}
          and ${paymentsTable.status} = 'approved'
      )
    group by ${categoryIdSql}, ${categoryNameSql}
    order by sum(${orderItemsTable.totalPrice}) desc nulls last
  `);

  const result = rows.rows.map((row) => ({
    categoryId: Number(row.categoryId),
    categoryName: String(row.categoryName ?? "Sem categoria"),
    totalSales: parseFloat(String(row.totalSales ?? 0)),
    itemCount: Number(row.itemCount),
  }));

  res.json(GetSalesByCategoryResponse.parse(result));
});

export default router;
