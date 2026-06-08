import { Router, type IRouter } from "express";
import {
  eq,
  and,
  inArray,
  notInArray,
  sql,
  or,
  isNull,
  notExists,
} from "drizzle-orm";
import {
  db,
  deliveryRoutesTable,
  deliveryRouteOrdersTable,
  ordersTable,
  customersTable,
  couriersTable,
  orderItemsTable,
  productsTable,
  paymentsTable,
  cashRegistersTable,
  cashMovementsTable,
} from "@workspace/db";
import { releaseTableIfOrderClosed } from "../lib/table-release";
import { getCurrentActor, requireOpenShift } from "../middleware/rbac";
import { getOrCreateSettings } from "./settings";

const router: IRouter = Router();

const ROUTE_COLORS = [
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#0f766e",
  "#475569",
] as const;

// ─── Eligible delivery statuses for routing ───────────────────────────────────

const LOGISTICALLY_ELIGIBLE_DELIVERY_STATUSES = [
  "pending",
  "preparing",
  "ready",
] as const;

function deliveryOrderCanEnterRouteWhereClause(
  storeId?: number,
  openedAt?: Date | null,
) {
  const conditions = [
    eq(ordersTable.type, "delivery"),
    notInArray(ordersTable.status, ["cancelled", "closed"]),
    inArray(ordersTable.deliveryStatus, [
      ...LOGISTICALLY_ELIGIBLE_DELIVERY_STATUSES,
    ]),
    notExists(
      db
        .select({ id: deliveryRouteOrdersTable.id })
        .from(deliveryRouteOrdersTable)
        .where(eq(deliveryRouteOrdersTable.orderId, ordersTable.id)),
    ),
  ];
  if (storeId) conditions.push(eq(ordersTable.storeId, storeId));
  if (openedAt) conditions.push(sql`${ordersTable.createdAt} >= ${openedAt}`);
  return and(...conditions);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseEstimatedDistanceKm(value: unknown): number | null {
  if (value == null) return null;
  const distance = Number.parseFloat(String(value));
  return Number.isFinite(distance) && distance > 0 ? distance : null;
}

function buildStoreRouteOrigin(
  settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
): {
  origin: string;
  hasStoreCep: boolean;
  hasCompleteAddress: boolean;
} {
  const storeCep = normalizeCep(settings.storeCep ?? "");
  const addressParts = [
    settings.storeAddress,
    settings.storeNumber,
    settings.storeNeighborhood,
    settings.storeCity,
    settings.storeState,
    settings.storeCountry,
  ]
    .map((part) => (part ? String(part).trim() : ""))
    .filter(Boolean);
  const hasCompleteAddress = Boolean(
    settings.storeAddress && settings.storeCity && settings.storeState,
  );

  return {
    origin: [storeCep, ...addressParts].filter(Boolean).join(", "),
    hasStoreCep: Boolean(storeCep),
    hasCompleteAddress,
  };
}

const MISSING_STORE_CEP_ROUTE_ERROR =
  "Configure o CEP da loja em Configurações para calcular rotas com precisão.";

function buildMapsUrl(
  storeAddress: string,
  orders: Array<{
    deliveryAddress: string | null;
    deliveryNeighborhood: string | null;
    deliveryCep: string | null;
    storeCity: string | null;
  }>,
): string {
  const origin = encodeURIComponent(storeAddress);
  const addresses = orders.map((o) => {
    const parts = [o.deliveryAddress, o.deliveryNeighborhood, o.storeCity]
      .filter(Boolean)

      .join(", ");
    return parts || (o.deliveryCep ?? "");
  });

  if (addresses.length === 0) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&travelmode=driving`;
  }

  const dest = encodeURIComponent(addresses[addresses.length - 1]);
  const waypoints = addresses.slice(0, -1).map(encodeURIComponent).join("|");

  const base = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
  return waypoints ? `${base}&waypoints=${waypoints}` : base;
}

async function getRouteWithOrders(
  routeId: number,
  storeId?: number,
  courierUserId?: number | null,
) {
  const [route] = await db
    .select()
    .from(deliveryRoutesTable)
    .where(
      and(
        eq(deliveryRoutesTable.id, routeId),
        ...(storeId ? [eq(deliveryRoutesTable.storeId, storeId)] : []),
        ...(courierUserId
          ? [eq(deliveryRoutesTable.courierId, courierUserId)]
          : []),
      ),
    );

  if (!route) return null;

  const routeOrders = await db
    .select({
      id: deliveryRouteOrdersTable.id,
      routeId: deliveryRouteOrdersTable.routeId,
      orderId: deliveryRouteOrdersTable.orderId,
      stopOrder: deliveryRouteOrdersTable.stopOrder,
      customerName: ordersTable.customerName,
      customerPhone: ordersTable.customerPhone,
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryCep: ordersTable.deliveryCep,
      deliveryFee: ordersTable.deliveryFee,
      estimatedDistanceKm: ordersTable.estimatedDistanceKm,
      deliveryStatus: ordersTable.deliveryStatus,
      totalAmount: ordersTable.totalAmount,
      paymentTiming: ordersTable.paymentTiming,
      deliveryPaymentMethod: ordersTable.deliveryPaymentMethod,
      needsChange: ordersTable.needsChange,
      changeFor: ordersTable.changeFor,
      deliveryPaymentNotes: ordersTable.deliveryPaymentNotes,
      orderCreatedAt: ordersTable.createdAt,
      orderKitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
    })
    .from(deliveryRouteOrdersTable)
    .leftJoin(ordersTable, eq(deliveryRouteOrdersTable.orderId, ordersTable.id))
    .where(eq(deliveryRouteOrdersTable.routeId, routeId))
    .orderBy(deliveryRouteOrdersTable.stopOrder);

  // Fetch items for all orders in this route
  const orderIds = routeOrders.map((o) => o.orderId);
  const allItems =
    orderIds.length > 0
      ? await db
          .select({
            orderId: orderItemsTable.orderId,
            productId: orderItemsTable.productId,
            productName: productsTable.name,
            quantity: orderItemsTable.quantity,
            unitPrice: orderItemsTable.unitPrice,
          })
          .from(orderItemsTable)
          .leftJoin(
            productsTable,
            eq(orderItemsTable.productId, productsTable.id),
          )
          .where(inArray(orderItemsTable.orderId, orderIds))
      : [];

  const totalDeliveryFee = routeOrders.reduce(
    (sum, o) => sum + parseFloat(String(o.deliveryFee ?? "0")),
    0,
  );

  // Total to receive on delivery (payment_timing = on_delivery)
  const totalToReceive = routeOrders
    .filter((o) => o.paymentTiming === "on_delivery")
    .reduce((sum, o) => sum + parseFloat(String(o.totalAmount ?? "0")), 0);

  // Total change needed (sum of (changeFor - totalAmount) where changeFor > totalAmount)
  const totalChangeNeeded = routeOrders
    .filter(
      (o) =>
        o.paymentTiming === "on_delivery" &&
        o.needsChange === "true" &&
        o.changeFor,
    )
    .reduce((sum, o) => {
      const changeFor = parseFloat(String(o.changeFor ?? "0"));
      const total = parseFloat(String(o.totalAmount ?? "0"));
      return sum + Math.max(0, changeFor - total);
    }, 0);

  return {
    ...route,
    includedNeighborhoods: JSON.parse(route.includedNeighborhoods) as string[],
    totalDeliveryFee,
    totalToReceive,
    totalChangeNeeded,
    dispatchDeadline: route.dispatchDeadline?.toISOString() ?? null,
    startedAt: route.startedAt?.toISOString() ?? null,
    completedAt: route.completedAt?.toISOString() ?? null,
    createdAt: route.createdAt.toISOString(),
    orders: routeOrders.map((o) => ({
      ...o,
      deliveryFee: parseFloat(String(o.deliveryFee ?? "0")),
      estimatedDistanceKm: parseEstimatedDistanceKm(o.estimatedDistanceKm),
      totalAmount: parseFloat(String(o.totalAmount ?? "0")),
      changeFor: o.changeFor ? parseFloat(String(o.changeFor)) : null,
      orderCreatedAt: o.orderCreatedAt?.toISOString() ?? null,
      orderKitchenAcceptedAt: o.orderKitchenAcceptedAt?.toISOString() ?? null,
      routeTimeAt:
        (o.orderKitchenAcceptedAt ?? o.orderCreatedAt)?.toISOString() ?? null,
      items: allItems
        .filter((i) => i.orderId === o.orderId)
        .map((i) => ({
          productId: i.productId,
          productName: i.productName ?? "Item",
          quantity: i.quantity,
          unitPrice: parseFloat(String(i.unitPrice)),
        })),
    })),
  };
}

// ─── Route generation algorithm ───────────────────────────────────────────────

interface EligibleOrder {
  id: number;
  deliveryAddress: string | null;
  deliveryNeighborhood: string | null;
  deliveryCep: string | null;
  deliveryFee: string | null;
  kitchenAcceptedAt: Date | null;
  createdAt: Date;
}

// ── CEP helpers ────────────────────────────────────────────────────────────────

/** Remove non-digits from CEP */
function normalizeCep(cep: string): string {
  return (cep ?? "").replace(/\D/g, "");
}

/**
 * Returns how many leading digits match between two CEPs (0–8).
 * Longer match = more geographically proximate.
 */
function cepPrefixMatchLength(a: string, b: string): number {
  const na = normalizeCep(a);
  const nb = normalizeCep(b);
  if (!na || !nb) return 0;
  let i = 0;
  while (i < Math.min(na.length, nb.length) && na[i] === nb[i]) i++;
  return i;
}

/** How close is an order CEP to the store CEP (0–8, higher = closer) */
function proximityToStore(storeCep: string, orderCep: string): number {
  return cepPrefixMatchLength(normalizeCep(storeCep), normalizeCep(orderCep));
}

/**
 * Compatibility score between two orders (higher = should be in same route).
 * CEP prefix match is the primary criterion; neighborhood name is secondary.
 * Neighborhood comparison is case-insensitive to handle "cajuru" vs "CAJURU".
 */
function orderPairScore(a: EligibleOrder, b: EligibleOrder): number {
  // CEP prefix similarity: each matching digit is worth 10 points
  const cepScore =
    cepPrefixMatchLength(a.deliveryCep ?? "", b.deliveryCep ?? "") * 10;

  const na = (a.deliveryNeighborhood ?? "").trim().toLowerCase();
  const nb = (b.deliveryNeighborhood ?? "").trim().toLowerCase();
  let neighborhoodScore = 0;
  if (na && nb) {
    if (na === nb) {
      neighborhoodScore = 20; // same neighborhood (case-insensitive)
    } else {
      neighborhoodScore = 0;
    }
  }

  return cepScore + neighborhoodScore;
}

/**
 * Minimum pair score required to add an order to an existing batch.
 *
 * Scoring reference:
 *   - Each shared CEP prefix digit = 10 pts
 *   - Same neighborhood (case-insensitive) = +20 pts
 *
 * Threshold = 18 means an order must share at least:
 *   - 2 CEP prefix digits (= 20 pts), OR
 *   - 1 CEP prefix digit + be in an adjacent neighborhood (= 10 + 8 = 18 pts)
 *
 * This prevents geographically distant areas (e.g. Batel vs Boqueirão,
 * which share only the leading "8" = 10 pts) from being grouped together
 * just to fill a route up to maxPerRoute.
 */
const MIN_PAIR_SCORE = 18;

/** Max order-time window allowed within a single route (30 minutes). */
const ROUTE_TIME_WINDOW_MINUTES = 30;
const MAX_ROUTE_ORDER_TIME_GAP_MS = ROUTE_TIME_WINDOW_MINUTES * 60_000;

/** Returns the operational route time (kitchen acceptance, or creation fallback). */
function routeTimeMs(o: EligibleOrder): number;
function routeTimeMs(o: {
  kitchenAcceptedAt: Date | null;
  createdAt: Date;
}): number;
function routeTimeMs(o: {
  kitchenAcceptedAt: Date | null;
  createdAt: Date;
}): number {
  return o.kitchenAcceptedAt?.getTime() ?? o.createdAt.getTime();
}

/**
 * Splits eligible orders into chronological windows before any distance logic.
 *
 * The oldest order in the current temporal group is the reference. If the next
 * order is more than ROUTE_TIME_WINDOW_MINUTES newer than that reference, it
 * starts a new temporal group even when CEP/neighborhood are very close.
 */
function groupOrdersByTimeWindow(orders: EligibleOrder[]): EligibleOrder[][] {
  const byUrgency = [...orders].sort((a, b) => routeTimeMs(a) - routeTimeMs(b));
  const groups: EligibleOrder[][] = [];

  for (const order of byUrgency) {
    const current = groups[groups.length - 1];
    if (!current || current.length === 0) {
      groups.push([order]);
      continue;
    }

    const referenceTime = routeTimeMs(current[0]);
    if (routeTimeMs(order) - referenceTime > MAX_ROUTE_ORDER_TIME_GAP_MS) {
      groups.push([order]);
    } else {
      current.push(order);
    }
  }

  return groups;
}

function buildRouteFromBatch(
  batch: EligibleOrder[],
  storeCep: string,
): { mainNeighborhood: string; orders: EligibleOrder[] } {
  const neighborhoodCounts = new Map<string, number>();
  for (const o of batch) {
    const n = (o.deliveryNeighborhood ?? "Outros").trim();
    neighborhoodCounts.set(n, (neighborhoodCounts.get(n) ?? 0) + 1);
  }
  const mainNeighborhood = [...neighborhoodCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0][0];

  const sortedBatch = [...batch].sort((a, b) => {
    const sA = proximityToStore(storeCep, a.deliveryCep ?? "");
    const sB = proximityToStore(storeCep, b.deliveryCep ?? "");
    if (sB !== sA) return sB - sA;
    return normalizeCep(a.deliveryCep ?? "").localeCompare(
      normalizeCep(b.deliveryCep ?? ""),
    );
  });

  return { mainNeighborhood, orders: sortedBatch };
}

/**
 * Greedy grouping algorithm — time window first, proximity second.
 *
 * 1. Sort all orders by kitchen acceptance time (createdAt fallback; oldest first).
 * 2. Create chronological groups using ROUTE_TIME_WINDOW_MINUTES from the
 *    oldest order in each group.
 * 3. Inside each temporal group only, form routes by CEP/neighborhood score.
 * 4. Routes may be smaller than maxPerRoute — geographically incompatible
 *    leftovers form their own routes within the same temporal group.
 *
 * Stops within each route are sorted closest-to-store first.
 */
function generateRoutePlan(
  orders: EligibleOrder[],
  maxPerRoute: number,
  storeCep: string,
): Array<{ mainNeighborhood: string; orders: EligibleOrder[] }> {
  const routes: Array<{ mainNeighborhood: string; orders: EligibleOrder[] }> =
    [];

  for (const temporalGroup of groupOrdersByTimeWindow(orders)) {
    const assigned = new Set<number>();

    for (const seed of temporalGroup) {
      if (assigned.has(seed.id)) continue;

      assigned.add(seed.id);
      const batch: EligibleOrder[] = [seed];
      const routeReferenceTime = routeTimeMs(seed);

      while (batch.length < maxPerRoute) {
        let bestOrder: EligibleOrder | null = null;
        let bestScore = MIN_PAIR_SCORE - 1;

        for (const o of temporalGroup) {
          if (assigned.has(o.id)) continue;

          // Defensive gate: never let automatic routing mix orders outside the
          // route seed's temporal window, even inside a temporal group boundary.
          if (
            routeTimeMs(o) - routeReferenceTime >
            MAX_ROUTE_ORDER_TIME_GAP_MS
          ) {
            continue;
          }

          const score = batch.reduce(
            (max, batchMember) => Math.max(max, orderPairScore(batchMember, o)),
            0,
          );
          if (score > bestScore) {
            bestScore = score;
            bestOrder = o;
          } else if (score === bestScore && bestOrder !== null) {
            if (routeTimeMs(o) < routeTimeMs(bestOrder)) {
              bestOrder = o;
            }
          }
        }

        if (!bestOrder) break;
        batch.push(bestOrder);
        assigned.add(bestOrder.id);
      }

      routes.push(buildRouteFromBatch(batch, storeCep));
    }
  }

  return routes;
}

// ─── Helper: recalculate route metadata after order changes ───────────────────

async function recalcRoute(
  routeId: number,
  storeOrigin: string,
  storeCity: string | null,
  dispatchMinutes: number,
): Promise<boolean> {
  const rows = await db
    .select({
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryCep: ordersTable.deliveryCep,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
      createdAt: ordersTable.createdAt,
    })
    .from(deliveryRouteOrdersTable)
    .innerJoin(
      ordersTable,
      eq(deliveryRouteOrdersTable.orderId, ordersTable.id),
    )
    .where(eq(deliveryRouteOrdersTable.routeId, routeId))
    .orderBy(deliveryRouteOrdersTable.stopOrder);

  if (rows.length === 0) {
    await db
      .delete(deliveryRoutesTable)
      .where(eq(deliveryRoutesTable.id, routeId));
    return false;
  }

  const nCounts = new Map<string, number>();
  for (const r of rows) {
    const n = (r.deliveryNeighborhood ?? "Outros").trim();
    nCounts.set(n, (nCounts.get(n) ?? 0) + 1);
  }
  const mainNeighborhood = [...nCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0][0];
  const includedNeighborhoods = [
    ...new Set(rows.map((r) => (r.deliveryNeighborhood ?? "Outros").trim())),
  ];

  const earliest = Math.min(...rows.map(routeTimeMs));
  const dispatchDeadline = new Date(earliest + dispatchMinutes * 60_000);

  const mapsUrl = buildMapsUrl(
    storeOrigin,
    rows.map((r) => ({ ...r, storeCity })),
  );

  await db
    .update(deliveryRoutesTable)
    .set({
      mainNeighborhood,
      includedNeighborhoods: JSON.stringify(includedNeighborhoods),
      mapsUrl,
      dispatchDeadline,
    })
    .where(eq(deliveryRoutesTable.id, routeId));

  return true;
}

// ─── GET /delivery/routes ─────────────────────────────────────────────────────

router.get("/delivery/routes", async (req, res): Promise<void> => {
  const scope = await requireOpenShift(req, res);
  if (!scope) return;
  const actor = scope.actor;
  const conditions = [eq(deliveryRoutesTable.storeId, actor.storeId)];
  if (actor.role === "motoboy" && actor.id)
    conditions.push(eq(deliveryRoutesTable.courierId, actor.id));
  if (actor.role === "atendente" && scope.openedAt)
    conditions.push(sql`${deliveryRoutesTable.createdAt} >= ${scope.openedAt}`);

  const routes = await db
    .select()
    .from(deliveryRoutesTable)
    .where(and(...conditions))
    .orderBy(sql`${deliveryRoutesTable.createdAt} DESC`);

  const full = await Promise.all(
    routes.map((r) =>
      getRouteWithOrders(
        r.id,
        actor.storeId,
        actor.role === "motoboy" ? actor.id : null,
      ),
    ),
  );
  res.json(full.filter(Boolean));
});

// ─── POST /delivery/routes/generate ──────────────────────────────────────────

router.post("/delivery/routes/generate", async (req, res): Promise<void> => {
  const scope = await requireOpenShift(req, res);
  if (!scope) return;
  const actor = scope.actor;
  const settings = await getOrCreateSettings(actor.storeId);
  const maxPerRoute = settings.maxOrdersPerRoute;

  const storeOriginInfo = buildStoreRouteOrigin(settings);
  if (!storeOriginInfo.hasStoreCep) {
    res.status(400).json({ error: MISSING_STORE_CEP_ROUTE_ERROR });
    return;
  }
  if (!storeOriginInfo.hasCompleteAddress) {
    req.log.warn(
      { storeId: actor.storeId },
      "Configure endereço completo da loja para melhorar cálculo de entrega e rotas.",
    );
  }
  const storeOrigin = storeOriginInfo.origin;

  // Eligible orders: only logistic whitelist deliveryStatus values.
  // Any missing/invalid deliveryStatus is treated as NOT eligible.
  const eligibleOrders = await db
    .select({
      id: ordersTable.id,
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryCep: ordersTable.deliveryCep,
      deliveryFee: ordersTable.deliveryFee,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(
      deliveryOrderCanEnterRouteWhereClause(
        actor.storeId,
        actor.role === "atendente" ? scope.openedAt : null,
      ),
    );

  if (eligibleOrders.length === 0) {
    res.json({ created: 0, routes: [] });
    return;
  }

  const plan = generateRoutePlan(
    eligibleOrders as EligibleOrder[],
    maxPerRoute,
    settings.storeCep ?? "",
  );

  const existingToday = await db
    .select({ id: deliveryRoutesTable.id })
    .from(deliveryRoutesTable)
    .where(
      and(
        eq(deliveryRoutesTable.storeId, actor.storeId),
        sql`DATE(${deliveryRoutesTable.createdAt}) = CURRENT_DATE`,
      ),
    );

  let colorIndex = existingToday.length % ROUTE_COLORS.length;
  let routeNumber = existingToday.length + 1;

  const dispatchMinutes = settings.deliveryDispatchTimeMinutes;
  const createdRoutes: number[] = [];

  for (const { mainNeighborhood, orders } of plan) {
    const includedNeighborhoods = [
      ...new Set(
        orders.map((o) => (o.deliveryNeighborhood ?? "Outros").trim()),
      ),
    ];
    const color = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];
    const name = `Rota ${routeNumber} — ${mainNeighborhood}`;

    // Orders are already sorted by proximity from generateRoutePlan
    const sortedOrders = orders;

    // Dispatch deadline = earliest operational route time + dispatchMinutes
    const earliest = Math.min(...sortedOrders.map(routeTimeMs));
    const dispatchDeadline = new Date(earliest + dispatchMinutes * 60_000);

    const mapsUrl = buildMapsUrl(
      storeOrigin,
      sortedOrders.map((o) => ({
        ...o,
        storeCity: settings.storeCity,
      })),
    );

    const [route] = await db
      .insert(deliveryRoutesTable)
      .values({
        storeId: actor.storeId,
        name,
        mainNeighborhood,
        includedNeighborhoods: JSON.stringify(includedNeighborhoods),
        status: "available",
        color,
        storeOrigin,
        mapsUrl,
        dispatchDeadline,
      })
      .returning();

    for (let i = 0; i < sortedOrders.length; i++) {
      await db.insert(deliveryRouteOrdersTable).values({
        routeId: route.id,
        orderId: sortedOrders[i].id,
        stopOrder: i + 1,
      });
    }

    colorIndex++;
    routeNumber++;
    createdRoutes.push(route.id);
  }

  const full = await Promise.all(
    createdRoutes.map((id) => getRouteWithOrders(id, actor.storeId)),
  );
  res.json({ created: full.length, routes: full.filter(Boolean) });
});

// ─── GET /delivery/orders/pending ─────────────────────────────────────────────

router.get("/delivery/orders/pending", async (req, res): Promise<void> => {
  const scope = await requireOpenShift(req, res);
  if (!scope) return;
  const actor = scope.actor;
  const settings = await getOrCreateSettings(actor.storeId);

  const orders = await db
    .select({
      id: ordersTable.id,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryCep: ordersTable.deliveryCep,
      deliveryFee: ordersTable.deliveryFee,
      estimatedDistanceKm: ordersTable.estimatedDistanceKm,
      totalAmount: ordersTable.totalAmount,
      deliveryStatus: ordersTable.deliveryStatus,
      paymentTiming: ordersTable.paymentTiming,
      needsChange: ordersTable.needsChange,
      changeFor: ordersTable.changeFor,
      deliveryPaymentMethod: ordersTable.deliveryPaymentMethod,
      createdAt: ordersTable.createdAt,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
    })
    .from(ordersTable)
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(
      deliveryOrderCanEnterRouteWhereClause(
        actor.storeId,
        actor.role === "atendente" ? scope.openedAt : null,
      ),
    )
    .orderBy(sql`${ordersTable.createdAt} DESC`);

  const dp = settings.deliveryDispatchTimeMinutes;
  const result = orders.map((o) => ({
    id: o.id,
    customerName: o.customerName ?? null,
    customerPhone: o.customerPhone ?? null,
    deliveryAddress: o.deliveryAddress,
    deliveryNeighborhood: o.deliveryNeighborhood,
    deliveryCep: o.deliveryCep,
    deliveryFee: parseFloat(String(o.deliveryFee ?? "0")),
    estimatedDistanceKm: parseEstimatedDistanceKm(o.estimatedDistanceKm),
    totalAmount: parseFloat(String(o.totalAmount ?? "0")),
    deliveryStatus: o.deliveryStatus,
    paymentTiming: o.paymentTiming ?? "now",
    needsChange: o.needsChange,
    changeFor: o.changeFor ? parseFloat(String(o.changeFor)) : null,
    deliveryPaymentMethod: o.deliveryPaymentMethod,
    createdAt: o.createdAt.toISOString(),
    kitchenAcceptedAt: o.kitchenAcceptedAt?.toISOString() ?? null,
    routeTimeAt: new Date(routeTimeMs(o)).toISOString(),
    dispatchDeadline: new Date(routeTimeMs(o) + dp * 60_000).toISOString(),
  }));

  res.json(result);
});

// ─── POST /delivery/routes/emergency ──────────────────────────────────────────
// NOTE: static path must come before /:id routes

router.post("/delivery/routes/emergency", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const orderId = parseInt(String(req.body?.orderId ?? ""), 10);
  if (isNaN(orderId)) {
    res.status(400).json({ error: "orderId required" });
    return;
  }

  const [order] = await db
    .select({
      id: ordersTable.id,
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryCep: ordersTable.deliveryCep,
      deliveryFee: ordersTable.deliveryFee,
      kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(
      and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, actor.storeId)),
    );
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const settings = await getOrCreateSettings(actor.storeId);
  const storeOriginInfo = buildStoreRouteOrigin(settings);
  const storeOrigin = storeOriginInfo.origin;
  if (!storeOriginInfo.hasStoreCep) {
    req.log.warn({ storeId: actor.storeId }, MISSING_STORE_CEP_ROUTE_ERROR);
  }

  // Remove from any existing active route
  const existingAssignments = await db
    .select({
      id: deliveryRouteOrdersTable.id,
      routeId: deliveryRouteOrdersTable.routeId,
    })
    .from(deliveryRouteOrdersTable)
    .innerJoin(
      deliveryRoutesTable,
      eq(deliveryRouteOrdersTable.routeId, deliveryRoutesTable.id),
    )
    .where(
      and(
        eq(deliveryRouteOrdersTable.orderId, orderId),
        notInArray(deliveryRoutesTable.status, ["completed"]),
      ),
    );

  for (const asgn of existingAssignments) {
    await db
      .delete(deliveryRouteOrdersTable)
      .where(eq(deliveryRouteOrdersTable.id, asgn.id));
    const rem = await db
      .select()
      .from(deliveryRouteOrdersTable)
      .where(eq(deliveryRouteOrdersTable.routeId, asgn.routeId))
      .orderBy(deliveryRouteOrdersTable.stopOrder);
    for (let i = 0; i < rem.length; i++) {
      await db
        .update(deliveryRouteOrdersTable)
        .set({ stopOrder: i + 1 })
        .where(eq(deliveryRouteOrdersTable.id, rem[i].id));
    }
    await recalcRoute(
      asgn.routeId,
      storeOrigin,
      settings.storeCity ?? null,
      settings.deliveryDispatchTimeMinutes,
    );
  }

  const existingToday = await db
    .select({ id: deliveryRoutesTable.id })
    .from(deliveryRoutesTable)
    .where(
      and(
        eq(deliveryRoutesTable.storeId, actor.storeId),
        sql`DATE(${deliveryRoutesTable.createdAt}) = CURRENT_DATE`,
      ),
    );

  const color = ROUTE_COLORS[existingToday.length % ROUTE_COLORS.length];
  const routeNumber = existingToday.length + 1;
  const mainNeighborhood = (order.deliveryNeighborhood ?? "Entrega").trim();
  const name = `Rota ${routeNumber} — ${mainNeighborhood} ⚡`;

  const startTime = routeTimeMs(order);
  const dispatchDeadline = new Date(
    startTime + settings.deliveryDispatchTimeMinutes * 60_000,
  );
  const mapsUrl = buildMapsUrl(storeOrigin, [
    { ...order, storeCity: settings.storeCity },
  ]);

  const [newRoute] = await db
    .insert(deliveryRoutesTable)
    .values({
      storeId: actor.storeId,
      name,
      mainNeighborhood,
      includedNeighborhoods: JSON.stringify([mainNeighborhood]),
      status: "available",
      color,
      storeOrigin,
      mapsUrl,
      dispatchDeadline,
    })
    .returning();

  await db
    .insert(deliveryRouteOrdersTable)
    .values({ routeId: newRoute.id, orderId, stopOrder: 1 });

  res.json(await getRouteWithOrders(newRoute.id, actor.storeId));
});

// ─── POST /delivery/routes/:id/assign ────────────────────────────────────────

router.post("/delivery/routes/:id/assign", async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id ?? "", 10);
  if (isNaN(routeId)) {
    res.status(400).json({ error: "Invalid route id" });
    return;
  }

  const rawCourierName =
    typeof req.body?.courierName === "string"
      ? req.body.courierName.trim()
      : "";
  const courierId =
    typeof req.body?.courierId === "number" ? req.body.courierId : null;
  if (!rawCourierName && !courierId) {
    res.status(400).json({ error: "courierId or courierName is required" });
    return;
  }

  const actor = await getCurrentActor(req);
  const [route] = await db
    .select()
    .from(deliveryRoutesTable)
    .where(
      and(
        eq(deliveryRoutesTable.id, routeId),
        eq(deliveryRoutesTable.storeId, actor.storeId),
      ),
    );
  if (!route) {
    res.status(404).json({ error: "Route not found" });
    return;
  }
  if (route.status !== "available") {
    res
      .status(400)
      .json({ error: `Cannot assign route in status '${route.status}'` });
    return;
  }

  let courierName = rawCourierName;
  if (courierId && !courierName) {
    const [c] = await db
      .select({ name: couriersTable.name })
      .from(couriersTable)
      .where(eq(couriersTable.id, courierId))
      .limit(1);
    if (!c) {
      res.status(404).json({ error: "Motoboy não encontrado" });
      return;
    }
    courierName = c.name;
  }

  await db
    .update(deliveryRoutesTable)
    .set({
      status: "in_progress",
      courierId,
      courierName,
      startedAt: new Date(),
    })
    .where(eq(deliveryRoutesTable.id, routeId));

  // Ao assumir rota, todos os pedidos vinculados saem do fluxo pré-rota.
  const routeOrders = await db
    .select({
      orderId: deliveryRouteOrdersTable.orderId,
      status: ordersTable.status,
    })
    .from(deliveryRouteOrdersTable)
    .leftJoin(ordersTable, eq(deliveryRouteOrdersTable.orderId, ordersTable.id))
    .where(eq(deliveryRouteOrdersTable.routeId, routeId));

  const routableOrderIds = routeOrders
    .filter((ro) => ro.status !== "closed" && ro.status !== "cancelled")
    .map((ro) => ro.orderId);

  if (routableOrderIds.length > 0) {
    await db
      .update(ordersTable)
      .set({ deliveryStatus: "out_for_delivery" })
      .where(inArray(ordersTable.id, routableOrderIds));
  }

  res.json(await getRouteWithOrders(routeId, actor.storeId));
});

// ─── POST /delivery/routes/:id/complete ──────────────────────────────────────

router.post(
  "/delivery/routes/:id/complete",
  async (req, res): Promise<void> => {
    const actor = await getCurrentActor(req);
    const routeId = parseInt(req.params.id ?? "", 10);
    if (isNaN(routeId)) {
      res.status(400).json({ error: "Invalid route id" });
      return;
    }

    const [route] = await db
      .select()
      .from(deliveryRoutesTable)
      .where(
        and(
          eq(deliveryRoutesTable.id, routeId),
          eq(deliveryRoutesTable.storeId, actor.storeId),
        ),
      );
    if (!route) {
      res.status(404).json({ error: "Route not found" });
      return;
    }
    if (route.status !== "in_progress") {
      res
        .status(400)
        .json({ error: `Cannot complete route in status '${route.status}'` });
      return;
    }

    const now = new Date();

    await db
      .update(deliveryRoutesTable)
      .set({ status: "completed", completedAt: now })
      .where(eq(deliveryRoutesTable.id, routeId));

    const routeOrders = await db
      .select({
        orderId: deliveryRouteOrdersTable.orderId,
        paymentTiming: ordersTable.paymentTiming,
      })
      .from(deliveryRouteOrdersTable)
      .leftJoin(
        ordersTable,
        eq(deliveryRouteOrdersTable.orderId, ordersTable.id),
      )
      .where(eq(deliveryRouteOrdersTable.routeId, routeId));

    // Orders already paid (paymentTiming=now): close them out immediately
    const nowOrderIds = routeOrders
      .filter((o) => o.paymentTiming !== "on_delivery")
      .map((o) => o.orderId);

    // Orders to be paid on delivery: move to awaiting_settlement — do NOT close
    const onDeliveryOrderIds = routeOrders
      .filter((o) => o.paymentTiming === "on_delivery")
      .map((o) => o.orderId);

    if (nowOrderIds.length > 0) {
      await db
        .update(ordersTable)
        .set({ deliveryStatus: "delivered", status: "closed", closedAt: now })
        .where(inArray(ordersTable.id, nowOrderIds));
      await Promise.all(
        nowOrderIds.map((closedOrderId) =>
          releaseTableIfOrderClosed(closedOrderId),
        ),
      );
    }

    if (onDeliveryOrderIds.length > 0) {
      await db
        .update(ordersTable)
        .set({ deliveryStatus: "awaiting_settlement", paidAt: null })
        .where(inArray(ordersTable.id, onDeliveryOrderIds));
    }

    res.json(await getRouteWithOrders(routeId, actor.storeId));
  },
);

// ─── POST /delivery/routes/:id/adjust-time ────────────────────────────────────

router.post(
  "/delivery/routes/:id/adjust-time",
  async (req, res): Promise<void> => {
    const routeId = parseInt(req.params.id ?? "", 10);
    if (isNaN(routeId)) {
      res.status(400).json({ error: "Invalid route id" });
      return;
    }

    const minutesDelta = parseInt(String(req.body?.minutesDelta ?? ""), 10);
    if (isNaN(minutesDelta)) {
      res.status(400).json({ error: "minutesDelta must be a number" });
      return;
    }

    const actor = await getCurrentActor(req);
    const [route] = await db
      .select()
      .from(deliveryRoutesTable)
      .where(
        and(
          eq(deliveryRoutesTable.id, routeId),
          eq(deliveryRoutesTable.storeId, actor.storeId),
        ),
      );
    if (!route) {
      res.status(404).json({ error: "Route not found" });
      return;
    }

    const currentDeadline = route.dispatchDeadline ?? new Date();
    const newDeadline = new Date(
      currentDeadline.getTime() + minutesDelta * 60_000,
    );

    await db
      .update(deliveryRoutesTable)
      .set({ dispatchDeadline: newDeadline })
      .where(eq(deliveryRoutesTable.id, routeId));

    res.json(await getRouteWithOrders(routeId));
  },
);

// ─── POST /delivery/routes/:id/add-order ─────────────────────────────────────
// Add a pending (not yet routed) delivery order directly to this route

router.post(
  "/delivery/routes/:id/add-order",
  async (req, res): Promise<void> => {
    const actor = await getCurrentActor(req);
    const routeId = parseInt(req.params.id ?? "", 10);
    if (isNaN(routeId)) {
      res.status(400).json({ error: "Invalid route id" });
      return;
    }

    const orderId = parseInt(String(req.body?.orderId ?? ""), 10);
    if (isNaN(orderId)) {
      res.status(400).json({ error: "orderId required" });
      return;
    }

    const [route] = await db
      .select()
      .from(deliveryRoutesTable)
      .where(
        and(
          eq(deliveryRoutesTable.id, routeId),
          eq(deliveryRoutesTable.storeId, actor.storeId),
        ),
      );
    if (!route) {
      res.status(404).json({ error: "Route not found" });
      return;
    }
    if (route.status === "completed") {
      res.status(400).json({ error: "Cannot add order to a completed route" });
      return;
    }

    const [order] = await db
      .select({
        id: ordersTable.id,
        type: ordersTable.type,
        deliveryStatus: ordersTable.deliveryStatus,
        kitchenAcceptedAt: ordersTable.kitchenAcceptedAt,
      })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (order.type !== "delivery") {
      res.status(400).json({ error: "Order is not a delivery order" });
      return;
    }

    // Check not already in an active route
    const existingAssignment = await db
      .select({ id: deliveryRouteOrdersTable.id })
      .from(deliveryRouteOrdersTable)
      .innerJoin(
        deliveryRoutesTable,
        eq(deliveryRouteOrdersTable.routeId, deliveryRoutesTable.id),
      )
      .where(
        and(
          eq(deliveryRouteOrdersTable.orderId, orderId),
          notInArray(deliveryRoutesTable.status, ["completed"]),
        ),
      );
    if (existingAssignment.length > 0) {
      res.status(400).json({ error: "Order is already in an active route" });
      return;
    }

    const settings = await getOrCreateSettings(actor.storeId);
    const storeOriginInfo = buildStoreRouteOrigin(settings);
    const storeOrigin = storeOriginInfo.origin;
    if (!storeOriginInfo.hasStoreCep) {
      req.log.warn({ storeId: actor.storeId }, MISSING_STORE_CEP_ROUTE_ERROR);
    }

    // Add to end of route
    const currentOrders = await db
      .select({ id: deliveryRouteOrdersTable.id })
      .from(deliveryRouteOrdersTable)
      .where(eq(deliveryRouteOrdersTable.routeId, routeId));

    await db.insert(deliveryRouteOrdersTable).values({
      routeId,
      orderId,
      stopOrder: currentOrders.length + 1,
    });

    // Ensure order has kitchenAcceptedAt set if missing
    if (!order.kitchenAcceptedAt) {
      await db
        .update(ordersTable)
        .set({ kitchenAcceptedAt: new Date() })
        .where(eq(ordersTable.id, orderId));
    }

    await recalcRoute(
      routeId,
      storeOrigin,
      settings.storeCity ?? null,
      settings.deliveryDispatchTimeMinutes,
    );

    res.json(await getRouteWithOrders(routeId));
  },
);

// ─── POST /delivery/routes/:id/move-order ────────────────────────────────────

router.post(
  "/delivery/routes/:id/move-order",
  async (req, res): Promise<void> => {
    const actor = await getCurrentActor(req);
    const routeId = parseInt(req.params.id ?? "", 10);
    if (isNaN(routeId)) {
      res.status(400).json({ error: "Invalid route id" });
      return;
    }

    const orderId = parseInt(String(req.body?.orderId ?? ""), 10);
    if (isNaN(orderId)) {
      res.status(400).json({ error: "orderId required" });
      return;
    }

    const targetRouteIdRaw = req.body?.targetRouteId;
    const targetRouteId =
      targetRouteIdRaw != null ? parseInt(String(targetRouteIdRaw), 10) : null;

    const [assignment] = await db
      .select({ id: deliveryRouteOrdersTable.id })
      .from(deliveryRouteOrdersTable)
      .innerJoin(
        deliveryRoutesTable,
        eq(deliveryRouteOrdersTable.routeId, deliveryRoutesTable.id),
      )
      .where(
        and(
          eq(deliveryRouteOrdersTable.routeId, routeId),
          eq(deliveryRouteOrdersTable.orderId, orderId),
          eq(deliveryRoutesTable.storeId, actor.storeId),
        ),
      );
    if (!assignment) {
      res.status(404).json({ error: "Order not in this route" });
      return;
    }

    const settings = await getOrCreateSettings(actor.storeId);
    const storeOriginInfo = buildStoreRouteOrigin(settings);
    const storeOrigin = storeOriginInfo.origin;
    if (!storeOriginInfo.hasStoreCep) {
      req.log.warn({ storeId: actor.storeId }, MISSING_STORE_CEP_ROUTE_ERROR);
    }

    // Remove from source route
    await db
      .delete(deliveryRouteOrdersTable)
      .where(eq(deliveryRouteOrdersTable.id, assignment.id));

    // Renumber remaining stops
    const remaining = await db
      .select()
      .from(deliveryRouteOrdersTable)
      .where(eq(deliveryRouteOrdersTable.routeId, routeId))
      .orderBy(deliveryRouteOrdersTable.stopOrder);
    for (let i = 0; i < remaining.length; i++) {
      await db
        .update(deliveryRouteOrdersTable)
        .set({ stopOrder: i + 1 })
        .where(eq(deliveryRouteOrdersTable.id, remaining[i].id));
    }

    const sourceStillExists = await recalcRoute(
      routeId,
      storeOrigin,
      settings.storeCity ?? null,
      settings.deliveryDispatchTimeMinutes,
    );

    // Optionally add to target route
    if (targetRouteId !== null && !isNaN(targetRouteId)) {
      const [targetRoute] = await db
        .select({ id: deliveryRoutesTable.id })
        .from(deliveryRoutesTable)
        .where(
          and(
            eq(deliveryRoutesTable.id, targetRouteId),
            eq(deliveryRoutesTable.storeId, actor.storeId),
          ),
        );
      if (!targetRoute) {
        res.status(404).json({ error: "Target route not found" });
        return;
      }

      const existingInTarget = await db
        .select()
        .from(deliveryRouteOrdersTable)
        .where(eq(deliveryRouteOrdersTable.routeId, targetRouteId));
      await db.insert(deliveryRouteOrdersTable).values({
        routeId: targetRouteId,
        orderId,
        stopOrder: existingInTarget.length + 1,
      });
      await recalcRoute(
        targetRouteId,
        storeOrigin,
        settings.storeCity ?? null,
        settings.deliveryDispatchTimeMinutes,
      );
    }

    const sourceRoute = sourceStillExists
      ? await getRouteWithOrders(routeId)
      : null;
    const targetRoute =
      targetRouteId !== null && !isNaN(targetRouteId)
        ? await getRouteWithOrders(targetRouteId)
        : null;

    res.json({ sourceRoute, targetRoute });
  },
);

// ─── GET /delivery/orders/awaiting-settlement ─────────────────────────────────
// Lista pedidos entregues aguardando baixa financeira (on_delivery, sem payment).

router.get(
  "/delivery/orders/awaiting-settlement",
  async (_req, res): Promise<void> => {
    const orders = await db
      .select({
        id: ordersTable.id,
        customerName: ordersTable.customerName,
        customerPhone: ordersTable.customerPhone,
        deliveryAddress: ordersTable.deliveryAddress,
        deliveryNeighborhood: ordersTable.deliveryNeighborhood,
        deliveryCep: ordersTable.deliveryCep,
        totalAmount: ordersTable.totalAmount,
        deliveryFee: ordersTable.deliveryFee,
        deliveryStatus: ordersTable.deliveryStatus,
        paymentTiming: ordersTable.paymentTiming,
        deliveryPaymentMethod: ordersTable.deliveryPaymentMethod,
        needsChange: ordersTable.needsChange,
        changeFor: ordersTable.changeFor,
        deliveryPaymentNotes: ordersTable.deliveryPaymentNotes,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.type, "delivery"),
          eq(ordersTable.deliveryStatus, "awaiting_settlement"),
          eq(ordersTable.paymentTiming, "on_delivery"),
          isNull(ordersTable.paidAt),
        ),
      )
      .orderBy(sql`${ordersTable.createdAt} DESC`);

    // Fetch route/courier info for each order
    const orderIds = orders.map((o) => o.id);
    const routeAssignments =
      orderIds.length > 0
        ? await db
            .select({
              orderId: deliveryRouteOrdersTable.orderId,
              routeName: deliveryRoutesTable.name,
              courierName: deliveryRoutesTable.courierName,
            })
            .from(deliveryRouteOrdersTable)
            .leftJoin(
              deliveryRoutesTable,
              eq(deliveryRouteOrdersTable.routeId, deliveryRoutesTable.id),
            )
            .where(inArray(deliveryRouteOrdersTable.orderId, orderIds))
        : [];

    const routeMap = new Map(routeAssignments.map((r) => [r.orderId, r]));

    const result = orders.map((o) => {
      const route = routeMap.get(o.id);
      const totalAmount = parseFloat(String(o.totalAmount ?? "0"));
      const changeFor = o.changeFor ? parseFloat(String(o.changeFor)) : null;
      return {
        id: o.id,
        customerName: o.customerName ?? null,
        customerPhone: o.customerPhone ?? null,
        deliveryAddress: o.deliveryAddress ?? null,
        deliveryNeighborhood: o.deliveryNeighborhood ?? null,
        deliveryCep: o.deliveryCep ?? null,
        totalAmount,
        deliveryFee: parseFloat(String(o.deliveryFee ?? "0")),
        deliveryStatus: o.deliveryStatus,
        paymentTiming: o.paymentTiming,
        deliveryPaymentMethod: o.deliveryPaymentMethod ?? null,
        needsChange: o.needsChange === "true",
        changeFor,
        expectedChange:
          o.needsChange === "true" && changeFor !== null
            ? Math.max(0, changeFor - totalAmount)
            : null,
        deliveryPaymentNotes: o.deliveryPaymentNotes ?? null,
        routeName: route?.routeName ?? null,
        courierName: route?.courierName ?? null,
        createdAt: o.createdAt.toISOString(),
      };
    });

    res.json(result);
  },
);

// ─── POST /delivery/orders/:id/settle ─────────────────────────────────────────
// Registra a baixa financeira de um pedido entregue com pagamento na entrega.

router.post("/delivery/orders/:id/settle", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id ?? "", 10);
  if (isNaN(orderId)) {
    res.status(400).json({ error: "orderId inválido" });
    return;
  }

  const rawMethod =
    typeof req.body?.method === "string" ? req.body.method.trim() : "";
  const amountReceived =
    typeof req.body?.amountReceived === "number"
      ? req.body.amountReceived
      : null;
  const notes =
    typeof req.body?.notes === "string" ? req.body.notes.trim() : null;

  const VALID_METHODS = ["cash", "pix", "credit_card", "debit_card", "voucher"];
  if (!VALID_METHODS.includes(rawMethod)) {
    res
      .status(400)
      .json({ error: `Método inválido. Use: ${VALID_METHODS.join(", ")}` });
    return;
  }

  const [order] = await db
    .select({
      id: ordersTable.id,
      type: ordersTable.type,
      deliveryStatus: ordersTable.deliveryStatus,
      paymentTiming: ordersTable.paymentTiming,
      totalAmount: ordersTable.totalAmount,
      status: ordersTable.status,
    })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado" });
    return;
  }

  if (order.deliveryStatus !== "awaiting_settlement") {
    res.status(409).json({
      error: `Pedido não está aguardando baixa (status atual: ${order.deliveryStatus})`,
    });
    return;
  }

  if (order.paymentTiming !== "on_delivery") {
    res.status(400).json({
      error: "Apenas pedidos com pagamento na entrega podem ser baixados aqui",
    });
    return;
  }

  const totalAmount = parseFloat(String(order.totalAmount ?? "0"));

  if (rawMethod === "cash") {
    if (amountReceived === null || isNaN(amountReceived)) {
      res.status(400).json({
        error:
          "Para pagamento em dinheiro, informe o valor recebido (amountReceived)",
      });
      return;
    }
    if (amountReceived < totalAmount) {
      res.status(400).json({
        error: `Valor recebido (R$ ${amountReceived.toFixed(2)}) menor que o total do pedido (R$ ${totalAmount.toFixed(2)})`,
      });
      return;
    }
  }

  const change =
    rawMethod === "cash" && amountReceived !== null
      ? Math.max(0, amountReceived - totalAmount)
      : null;

  try {
    const result = await db.transaction(async (tx) => {
      // Check no duplicate payment
      const [existing] = await tx
        .select({ id: paymentsTable.id })
        .from(paymentsTable)
        .where(eq(paymentsTable.orderId, orderId))
        .limit(1);

      if (existing) {
        const err = new Error(
          "Pagamento deste pedido já foi registrado.",
        ) as Error & { duplicate: true };
        err.duplicate = true;
        throw err;
      }

      // Check open cash register
      const [openRegister] = await tx
        .select({ id: cashRegistersTable.id })
        .from(cashRegistersTable)
        .where(eq(cashRegistersTable.status, "open"))
        .orderBy(sql`${cashRegistersTable.openedAt} DESC`)
        .limit(1);

      if (!openRegister) {
        const err = new Error(
          "Abra o caixa antes de registrar recebimentos de entrega.",
        ) as Error & { noCash: true };
        err.noCash = true;
        throw err;
      }

      const now = new Date();

      // Create payment record
      const [payment] = await tx
        .insert(paymentsTable)
        .values({
          orderId,
          amount: String(totalAmount),
          method: rawMethod,
          status: "approved",
          change: change !== null ? String(change) : null,
        })
        .returning();

      // Create cash movement
      await tx.insert(cashMovementsTable).values({
        cashRegisterId: openRegister.id,
        type: "payment",
        amount: String(totalAmount),
        paymentMethod: rawMethod,
        reason: notes ?? `Baixa entrega Pedido #${orderId}`,
        orderId,
      });

      // Close the order
      await tx
        .update(ordersTable)
        .set({
          deliveryStatus: "delivered",
          status: "closed",
          paidAt: now,
          closedAt: now,
        })
        .where(eq(ordersTable.id, orderId));
      await releaseTableIfOrderClosed(orderId, tx as unknown as typeof db);

      return payment!;
    });

    res.status(201).json({
      ...result,
      amount: parseFloat(String(result.amount)),
      change: result.change !== null ? parseFloat(String(result.change)) : null,
      createdAt: result.createdAt.toISOString(),
    });
  } catch (err) {
    if (err && typeof err === "object") {
      if ((err as { duplicate?: boolean }).duplicate) {
        res
          .status(409)
          .json({ error: "Pagamento deste pedido já foi registrado." });
        return;
      }
      if ((err as { noCash?: boolean }).noCash) {
        res.status(409).json({
          error: "Abra o caixa antes de registrar recebimentos de entrega.",
        });
        return;
      }
    }
    throw err;
  }
});

// ─── POST /delivery/orders/:orderId/delivered ─────────────────────────────────
// Marca um pedido de delivery individual como entregue.
// Para on_delivery: move para awaiting_settlement. Para now: fecha direto.

router.post(
  "/delivery/orders/:orderId/delivered",
  async (req, res): Promise<void> => {
    const orderId = parseInt(req.params.orderId, 10);
    if (isNaN(orderId)) {
      res.status(400).json({ error: "orderId inválido" });
      return;
    }

    const [order] = await db
      .select({
        id: ordersTable.id,
        type: ordersTable.type,
        deliveryStatus: ordersTable.deliveryStatus,
        paymentTiming: ordersTable.paymentTiming,
      })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    if (!order) {
      res.status(404).json({ error: "Pedido não encontrado" });
      return;
    }

    if (order.type !== "delivery") {
      res
        .status(400)
        .json({ error: "Apenas pedidos de delivery podem ser baixados aqui" });
      return;
    }

    const now = new Date();

    if (order.paymentTiming === "on_delivery") {
      await db
        .update(ordersTable)
        .set({ deliveryStatus: "awaiting_settlement" })
        .where(eq(ordersTable.id, orderId));
      req.log.info({ orderId }, "delivery order moved to awaiting_settlement");
    } else {
      await db
        .update(ordersTable)
        .set({ deliveryStatus: "delivered", status: "closed", closedAt: now })
        .where(eq(ordersTable.id, orderId));
      await releaseTableIfOrderClosed(orderId);
      req.log.info(
        { orderId },
        "delivery order marked as delivered and closed",
      );
    }

    res.json({ ok: true });
  },
);

export default router;
