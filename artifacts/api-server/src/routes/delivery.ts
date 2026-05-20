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

/**
 * Sort by neighborhood + CEP + address for optimal route grouping.
 * Same neighborhood, then closest CEP prefix, then address.
 */
function sortByCepAndAddress(orders: EligibleOrder[]): EligibleOrder[] {
  return [...orders].sort((a, b) => {
    const cepA = (a.deliveryCep ?? "").replace(/\D/g, "");
    const cepB = (b.deliveryCep ?? "").replace(/\D/g, "");
    if (cepA && cepB) {
      const cepCmp = cepA.localeCompare(cepB);
      if (cepCmp !== 0) return cepCmp;
    }
    return (a.deliveryAddress ?? "").localeCompare(b.deliveryAddress ?? "");
  });
}

function generateRoutePlan(
  orders: EligibleOrder[],
  maxPerRoute: number
): Array<{ mainNeighborhood: string; orders: EligibleOrder[] }> {
  const assigned = new Set<number>();
  const routes: Array<{ mainNeighborhood: string; orders: EligibleOrder[] }> = [];

  // Group by neighborhood
  const byNeighborhood = new Map<string, EligibleOrder[]>();
  for (const order of orders) {
    const n = order.deliveryNeighborhood ?? "Outros";
    if (!byNeighborhood.has(n)) byNeighborhood.set(n, []);
    byNeighborhood.get(n)!.push(order);
  }

  // Sort neighborhoods by order count descending
  const neighborhoods = [...byNeighborhood.keys()].sort(
    (a, b) => byNeighborhood.get(b)!.length - byNeighborhood.get(a)!.length
  );

  for (const neighborhood of neighborhoods) {
    const allInNeighborhood = sortByCepAndAddress(
      byNeighborhood.get(neighborhood)!.filter((o) => !assigned.has(o.id))
    );
    if (allInNeighborhood.length === 0) continue;

    // Chunk into batches of maxPerRoute
    let remaining = [...allInNeighborhood];
    let isFirst = true;

    while (remaining.length > 0) {
      let batch = remaining.slice(0, maxPerRoute);
      remaining = remaining.slice(maxPerRoute);
      batch.forEach((o) => assigned.add(o.id));

      // Fill batch from adjacent neighborhoods if this is first batch and there's room
      if (isFirst && batch.length < maxPerRoute) {
        const neighbors = getNeighbors(neighborhood);
        for (const neighbor of neighbors) {
          if (batch.length >= maxPerRoute) break;
          const neighborOrders = sortByCepAndAddress(
            (byNeighborhood.get(neighbor) ?? []).filter((o) => !assigned.has(o.id))
          );
          if (neighborOrders.length === 0) continue;
          const toAdd = neighborOrders.slice(0, maxPerRoute - batch.length);
          toAdd.forEach((o) => assigned.add(o.id));
          batch = [...batch, ...toAdd];
        }
      }
      isFirst = false;

      routes.push({ mainNeighborhood: neighborhood, orders: batch });
    }
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

  const plan = generateRoutePlan(eligibleOrders as EligibleOrder[], maxPerRoute);

  const existingToday = await db
    .select({ id: deliveryRoutesTable.id })
    .from(deliveryRoutesTable)
    .where(sql`DATE(${deliveryRoutesTable.createdAt}) = CURRENT_DATE`);

  let colorIndex = existingToday.length % ROUTE_COLORS.length;
  let routeNumber = existingToday.length + 1;

  const dispatchMinutes = settings.deliveryDispatchTimeMinutes;
  const createdRoutes: number[] = [];

  for (const { mainNeighborhood, orders } of plan) {
    const includedNeighborhoods = [...new Set(orders.map((o) => o.deliveryNeighborhood ?? "Outros"))];
    const color = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];
    const name = `Rota ${routeNumber} — ${mainNeighborhood}`;

    // Sort stops: main neighborhood first (by CEP), then adjacent (by CEP)
    const mainOrders = sortByCepAndAddress(
      orders.filter((o) => (o.deliveryNeighborhood ?? "Outros") === mainNeighborhood)
    );
    const otherOrders = sortByCepAndAddress(
      orders.filter((o) => (o.deliveryNeighborhood ?? "Outros") !== mainNeighborhood)
    );
    const sortedOrders = [...mainOrders, ...otherOrders];

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
