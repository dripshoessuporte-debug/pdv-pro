import { Router, type IRouter } from "express";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import { db, deliveryRoutesTable, deliveryRouteOrdersTable, ordersTable } from "@workspace/db";
import { getOrCreateSettings } from "./settings";

const router: IRouter = Router();

// ─── Neighborhood proximity map ───────────────────────────────────────────────

const NEIGHBORHOOD_PROXIMITY: Record<string, string[]> = {
  "Boqueirão":      ["Hauer", "Xaxim", "Alto Boqueirão"],
  "Xaxim":          ["Boqueirão", "Pinheirinho", "Sítio Cercado"],
  "Pinheirinho":    ["Xaxim", "Capão Raso", "CIC"],
  "Centro":         ["Batel", "Rebouças", "Alto da XV"],
  "Batel":          ["Centro", "Rebouças", "Água Verde"],
  "Hauer":          ["Boqueirão", "Alto Boqueirão", "Portão"],
  "Água Verde":     ["Batel", "Portão", "Novo Mundo"],
  "Portão":         ["Água Verde", "Hauer", "Novo Mundo"],
  "Novo Mundo":     ["Portão", "Pinheirinho", "Capão Raso"],
  "Capão Raso":     ["Novo Mundo", "Pinheirinho", "Xaxim"],
  "CIC":            ["Pinheirinho", "Capão Raso"],
  "Rebouças":       ["Centro", "Batel", "Alto da XV"],
  "Alto da XV":     ["Centro", "Rebouças", "Bigorrilho"],
  "Bigorrilho":     ["Alto da XV", "Batel", "Mercês"],
  "Mercês":         ["Bigorrilho", "Batel", "São Francisco"],
  "Alto Boqueirão": ["Boqueirão", "Hauer", "Sítio Cercado"],
  "Sítio Cercado":  ["Xaxim", "Alto Boqueirão", "Tatuquara"],
  "Tatuquara":      ["Sítio Cercado", "CIC"],
  "São Francisco":  ["Mercês", "Centro"],
};

const ROUTE_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f97316",
  "#a855f7", "#ec4899", "#14b8a6", "#eab308",
];

// ─── Eligible delivery statuses for routing ───────────────────────────────────

const ELIGIBLE_DELIVERY_STATUSES = ["preparing", "ready"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNeighbors(neighborhood: string): string[] {
  return NEIGHBORHOOD_PROXIMITY[neighborhood] ?? [];
}

function buildMapsUrl(
  storeAddress: string,
  orders: Array<{ deliveryAddress: string | null; deliveryNeighborhood: string | null; deliveryCep: string | null; storeCity: string | null }>
): string {
  const origin = encodeURIComponent(storeAddress);
  const addresses = orders.map((o) => {
    const parts = [o.deliveryAddress, o.deliveryNeighborhood, o.storeCity ?? "Curitiba, PR"]
      .filter(Boolean)
      .join(", ");
    return parts;
  });

  if (addresses.length === 0) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&travelmode=driving`;
  }

  const dest = encodeURIComponent(addresses[addresses.length - 1]);
  const waypoints = addresses.slice(0, -1).map(encodeURIComponent).join("|");

  const base = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
  return waypoints ? `${base}&waypoints=${waypoints}` : base;
}

async function getRouteWithOrders(routeId: number) {
  const [route] = await db
    .select()
    .from(deliveryRoutesTable)
    .where(eq(deliveryRoutesTable.id, routeId));

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
      deliveryStatus: ordersTable.deliveryStatus,
      totalAmount: ordersTable.totalAmount,
      paymentTiming: ordersTable.paymentTiming,
      deliveryPaymentMethod: ordersTable.deliveryPaymentMethod,
      needsChange: ordersTable.needsChange,
      changeFor: ordersTable.changeFor,
      deliveryPaymentNotes: ordersTable.deliveryPaymentNotes,
      orderCreatedAt: ordersTable.createdAt,
    })
    .from(deliveryRouteOrdersTable)
    .leftJoin(ordersTable, eq(deliveryRouteOrdersTable.orderId, ordersTable.id))
    .where(eq(deliveryRouteOrdersTable.routeId, routeId))
    .orderBy(deliveryRouteOrdersTable.stopOrder);

  const totalDeliveryFee = routeOrders.reduce(
    (sum, o) => sum + parseFloat(String(o.deliveryFee ?? "0")),
    0
  );

  // Total to receive on delivery (payment_timing = on_delivery)
  const totalToReceive = routeOrders
    .filter((o) => o.paymentTiming === "on_delivery")
    .reduce((sum, o) => sum + parseFloat(String(o.totalAmount ?? "0")), 0);

  // Total change needed (sum of (changeFor - totalAmount) where changeFor > totalAmount)
  const totalChangeNeeded = routeOrders
    .filter((o) => o.paymentTiming === "on_delivery" && o.needsChange === "true" && o.changeFor)
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
      totalAmount: parseFloat(String(o.totalAmount ?? "0")),
      changeFor: o.changeFor ? parseFloat(String(o.changeFor)) : null,
      orderCreatedAt: o.orderCreatedAt?.toISOString() ?? null,
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
  const cepScore = cepPrefixMatchLength(a.deliveryCep ?? "", b.deliveryCep ?? "") * 10;

  const na = (a.deliveryNeighborhood ?? "").trim().toLowerCase();
  const nb = (b.deliveryNeighborhood ?? "").trim().toLowerCase();
  let neighborhoodScore = 0;
  if (na && nb) {
    if (na === nb) {
      neighborhoodScore = 20; // same neighborhood (case-insensitive)
    } else {
      // Check adjacency from both sides (case-insensitive keys)
      const aNeighbors = getNeighbors(a.deliveryNeighborhood ?? "").map((n) => n.toLowerCase());
      const bNeighbors = getNeighbors(b.deliveryNeighborhood ?? "").map((n) => n.toLowerCase());
      if (aNeighbors.includes(nb) || bNeighbors.includes(na)) {
        neighborhoodScore = 8;
      }
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
 *   - Adjacent neighborhood = +8 pts
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

/**
 * Greedy proximity-based grouping algorithm.
 *
 * 1. Sort all orders by proximity to the store CEP (closest first).
 * 2. For each unassigned order (seed), fill a batch with the most compatible
 *    remaining orders that exceed MIN_PAIR_SCORE.
 * 3. Routes may be smaller than maxPerRoute — distant leftovers form their
 *    own routes rather than being forced into a nearby one.
 *
 * The store CEP is the reference for seeding order (closest to the store
 * seeds first) and for sorting stops within each route.
 */
function generateRoutePlan(
  orders: EligibleOrder[],
  maxPerRoute: number,
  storeCep: string
): Array<{ mainNeighborhood: string; orders: EligibleOrder[] }> {
  const assigned = new Set<number>();
  const routes: Array<{ mainNeighborhood: string; orders: EligibleOrder[] }> = [];

  // Pre-sort by proximity to store so we seed routes with the nearest orders first
  const byProximity = [...orders].sort((a, b) => {
    const sA = proximityToStore(storeCep, a.deliveryCep ?? "");
    const sB = proximityToStore(storeCep, b.deliveryCep ?? "");
    if (sB !== sA) return sB - sA;
    return normalizeCep(a.deliveryCep ?? "").localeCompare(normalizeCep(b.deliveryCep ?? ""));
  });

  for (const seed of byProximity) {
    if (assigned.has(seed.id)) continue;

    assigned.add(seed.id);
    const batch: EligibleOrder[] = [seed];

    // Fill batch greedily up to maxPerRoute.
    //
    // At each step, score each unassigned candidate against the BEST (maximum)
    // match with any current batch member — not just the seed. This ensures
    // that once a Batel order is in the batch, other Batel orders score much
    // higher (same neighbourhood + matching CEP) and are preferred over orders
    // from a different neighbourhood that only scored well against the seed.
    //
    // Only candidates that reach MIN_PAIR_SCORE against at least one batch
    // member are considered, preventing geographically distant orders from
    // being pulled in just to fill the route.
    while (batch.length < maxPerRoute) {
      let bestOrder: EligibleOrder | null = null;
      let bestScore = MIN_PAIR_SCORE - 1; // must exceed threshold to qualify

      for (const o of byProximity) {
        if (assigned.has(o.id)) continue;
        // Score vs every current batch member; keep the maximum
        const score = batch.reduce(
          (max, batchMember) => Math.max(max, orderPairScore(batchMember, o)),
          0
        );
        if (score > bestScore) {
          bestScore = score;
          bestOrder = o;
        } else if (score === bestScore && bestOrder !== null) {
          // Tiebreak: lower CEP numeric string wins (i.e. closer to store)
          if (
            normalizeCep(o.deliveryCep ?? "") <
            normalizeCep(bestOrder.deliveryCep ?? "")
          ) {
            bestOrder = o;
          }
        }
      }

      if (!bestOrder) break; // no more compatible candidates
      batch.push(bestOrder);
      assigned.add(bestOrder.id);
    }

    // Determine main neighborhood (most frequent, preserving original casing)
    const neighborhoodCounts = new Map<string, number>();
    for (const o of batch) {
      const n = (o.deliveryNeighborhood ?? "Outros").trim();
      neighborhoodCounts.set(n, (neighborhoodCounts.get(n) ?? 0) + 1);
    }
    const mainNeighborhood = [...neighborhoodCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0][0];

    // Sort stops: closest to store first, then by CEP
    const sortedBatch = [...batch].sort((a, b) => {
      const sA = proximityToStore(storeCep, a.deliveryCep ?? "");
      const sB = proximityToStore(storeCep, b.deliveryCep ?? "");
      if (sB !== sA) return sB - sA;
      return normalizeCep(a.deliveryCep ?? "").localeCompare(normalizeCep(b.deliveryCep ?? ""));
    });

    routes.push({ mainNeighborhood, orders: sortedBatch });
  }

  return routes;
}

// ─── GET /delivery/routes ─────────────────────────────────────────────────────

router.get("/delivery/routes", async (_req, res): Promise<void> => {
  const routes = await db
    .select()
    .from(deliveryRoutesTable)
    .orderBy(sql`${deliveryRoutesTable.createdAt} DESC`);

  const full = await Promise.all(routes.map((r) => getRouteWithOrders(r.id)));
  res.json(full.filter(Boolean));
});

// ─── POST /delivery/routes/generate ──────────────────────────────────────────

router.post("/delivery/routes/generate", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  const maxPerRoute = settings.maxOrdersPerRoute;

  // Build store origin string from settings
  const storeOriginParts = [
    settings.storeAddress,
    settings.storeNeighborhood,
    settings.storeCity ?? "Curitiba, PR",
  ].filter(Boolean);
  const storeOrigin = storeOriginParts.length > 0
    ? storeOriginParts.join(", ")
    : "Curitiba, PR";

  // Find orders already in active routes
  const activeRoutes = await db
    .select({ id: deliveryRoutesTable.id })
    .from(deliveryRoutesTable)
    .where(notInArray(deliveryRoutesTable.status, ["completed"]));

  let alreadyInRouteOrderIds: number[] = [];
  if (activeRoutes.length > 0) {
    const existing = await db
      .select({ orderId: deliveryRouteOrdersTable.orderId })
      .from(deliveryRouteOrdersTable)
      .where(inArray(deliveryRouteOrdersTable.routeId, activeRoutes.map((r) => r.id)));
    alreadyInRouteOrderIds = existing.map((ro) => ro.orderId);
  }

  // Eligible orders: delivery, preparing OR ready, not cancelled, not already in route
  let eligibleOrders = await db
    .select({
      id: ordersTable.id,
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryCep: ordersTable.deliveryCep,
      deliveryFee: ordersTable.deliveryFee,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.type, "delivery"),
        inArray(ordersTable.deliveryStatus, ELIGIBLE_DELIVERY_STATUSES),
        notInArray(ordersTable.status, ["cancelled"])
      )
    );

  if (alreadyInRouteOrderIds.length > 0) {
    eligibleOrders = eligibleOrders.filter((o) => !alreadyInRouteOrderIds.includes(o.id));
  }

  if (eligibleOrders.length === 0) {
    res.json({ created: 0, routes: [] });
    return;
  }

  const plan = generateRoutePlan(eligibleOrders as EligibleOrder[], maxPerRoute, settings.storeCep ?? "");

  const existingToday = await db
    .select({ id: deliveryRoutesTable.id })
    .from(deliveryRoutesTable)
    .where(sql`DATE(${deliveryRoutesTable.createdAt}) = CURRENT_DATE`);

  let colorIndex = existingToday.length % ROUTE_COLORS.length;
  let routeNumber = existingToday.length + 1;

  const dispatchMinutes = settings.deliveryDispatchTimeMinutes;
  const createdRoutes: number[] = [];

  for (const { mainNeighborhood, orders } of plan) {
    const includedNeighborhoods = [...new Set(orders.map((o) => (o.deliveryNeighborhood ?? "Outros").trim()))];
    const color = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];
    const name = `Rota ${routeNumber} — ${mainNeighborhood}`;

    // Orders are already sorted by proximity from generateRoutePlan
    const sortedOrders = orders;

    // Dispatch deadline = now + dispatchMinutes
    const dispatchDeadline = new Date(Date.now() + dispatchMinutes * 60_000);

    const mapsUrl = buildMapsUrl(
      storeOrigin,
      sortedOrders.map((o) => ({
        ...o,
        storeCity: settings.storeCity,
      }))
    );

    const [route] = await db.insert(deliveryRoutesTable).values({
      name,
      mainNeighborhood,
      includedNeighborhoods: JSON.stringify(includedNeighborhoods),
      status: "available",
      color,
      storeOrigin,
      mapsUrl,
      dispatchDeadline,
    }).returning();

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

  const full = await Promise.all(createdRoutes.map((id) => getRouteWithOrders(id)));
  res.json({ created: full.length, routes: full.filter(Boolean) });
});

// ─── POST /delivery/routes/:id/assign ────────────────────────────────────────

router.post("/delivery/routes/:id/assign", async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id ?? "", 10);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route id" }); return; }

  const courierName = typeof req.body?.courierName === "string" ? req.body.courierName.trim() : "";
  if (!courierName) { res.status(400).json({ error: "courierName is required" }); return; }

  const [route] = await db.select().from(deliveryRoutesTable).where(eq(deliveryRoutesTable.id, routeId));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }
  if (route.status !== "available") {
    res.status(400).json({ error: `Cannot assign route in status '${route.status}'` }); return;
  }

  await db.update(deliveryRoutesTable)
    .set({ status: "in_progress", courierName, startedAt: new Date() })
    .where(eq(deliveryRoutesTable.id, routeId));

  const routeOrders = await db
    .select({ orderId: deliveryRouteOrdersTable.orderId })
    .from(deliveryRouteOrdersTable)
    .where(eq(deliveryRouteOrdersTable.routeId, routeId));

  if (routeOrders.length > 0) {
    await db.update(ordersTable)
      .set({ deliveryStatus: "out_for_delivery" })
      .where(inArray(ordersTable.id, routeOrders.map((ro) => ro.orderId)));
  }

  res.json(await getRouteWithOrders(routeId));
});

// ─── POST /delivery/routes/:id/complete ──────────────────────────────────────

router.post("/delivery/routes/:id/complete", async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id ?? "", 10);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route id" }); return; }

  const [route] = await db.select().from(deliveryRoutesTable).where(eq(deliveryRoutesTable.id, routeId));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }
  if (route.status !== "in_progress") {
    res.status(400).json({ error: `Cannot complete route in status '${route.status}'` }); return;
  }

  await db.update(deliveryRoutesTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(deliveryRoutesTable.id, routeId));

  const routeOrders = await db
    .select({ orderId: deliveryRouteOrdersTable.orderId })
    .from(deliveryRouteOrdersTable)
    .where(eq(deliveryRouteOrdersTable.routeId, routeId));

  if (routeOrders.length > 0) {
    await db.update(ordersTable)
      .set({ deliveryStatus: "delivered" })
      .where(inArray(ordersTable.id, routeOrders.map((ro) => ro.orderId)));
  }

  res.json(await getRouteWithOrders(routeId));
});

// ─── POST /delivery/routes/:id/adjust-time ────────────────────────────────────

router.post("/delivery/routes/:id/adjust-time", async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id ?? "", 10);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route id" }); return; }

  const minutesDelta = parseInt(String(req.body?.minutesDelta ?? ""), 10);
  if (isNaN(minutesDelta)) { res.status(400).json({ error: "minutesDelta must be a number" }); return; }

  const [route] = await db.select().from(deliveryRoutesTable).where(eq(deliveryRoutesTable.id, routeId));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  const currentDeadline = route.dispatchDeadline ?? new Date();
  const newDeadline = new Date(currentDeadline.getTime() + minutesDelta * 60_000);

  await db.update(deliveryRoutesTable)
    .set({ dispatchDeadline: newDeadline })
    .where(eq(deliveryRoutesTable.id, routeId));

  res.json(await getRouteWithOrders(routeId));
});

export default router;
