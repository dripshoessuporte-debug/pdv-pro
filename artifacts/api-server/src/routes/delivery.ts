import { Router, type IRouter } from "express";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import { db, deliveryRoutesTable, deliveryRouteOrdersTable, ordersTable } from "@workspace/db";

const router: IRouter = Router();

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Store origin used as the departure point for all delivery route maps.
 * Change this to match the real store address before going to production.
 */
const STORE_ORIGIN = {
  name: "PDV Pro",
  cep: "80010-010",
  address: "Rua XV de Novembro, 500, Centro, Curitiba, PR",
};

/**
 * Neighborhood proximity map.
 * Key = neighborhood name, Value = list of adjacent neighborhoods.
 * Edit freely to match the delivery area.
 */
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

const MAX_PER_ROUTE = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNeighbors(neighborhood: string): string[] {
  return NEIGHBORHOOD_PROXIMITY[neighborhood] ?? [];
}

function buildMapsUrl(orders: Array<{ deliveryAddress: string | null; deliveryNeighborhood: string | null }>): string {
  const origin = encodeURIComponent(STORE_ORIGIN.address);
  const addresses = orders.map(
    (o) => `${o.deliveryAddress ?? ""}, ${o.deliveryNeighborhood ?? ""}, Curitiba, PR`
  );

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
      deliveryFee: ordersTable.deliveryFee,
      deliveryStatus: ordersTable.deliveryStatus,
    })
    .from(deliveryRouteOrdersTable)
    .leftJoin(ordersTable, eq(deliveryRouteOrdersTable.orderId, ordersTable.id))
    .where(eq(deliveryRouteOrdersTable.routeId, routeId))
    .orderBy(deliveryRouteOrdersTable.stopOrder);

  const totalDeliveryFee = routeOrders.reduce(
    (sum, o) => sum + parseFloat(String(o.deliveryFee ?? "0")),
    0
  );

  return {
    ...route,
    includedNeighborhoods: JSON.parse(route.includedNeighborhoods) as string[],
    totalDeliveryFee,
    startedAt: route.startedAt?.toISOString() ?? null,
    completedAt: route.completedAt?.toISOString() ?? null,
    createdAt: route.createdAt.toISOString(),
    orders: routeOrders.map((o) => ({
      ...o,
      deliveryFee: parseFloat(String(o.deliveryFee ?? "0")),
    })),
  };
}

// ─── Route generation algorithm ───────────────────────────────────────────────

interface EligibleOrder {
  id: number;
  deliveryAddress: string | null;
  deliveryNeighborhood: string | null;
  deliveryFee: string | null;
}

function sortByAddress(orders: EligibleOrder[]): EligibleOrder[] {
  return [...orders].sort((a, b) =>
    (a.deliveryAddress ?? "").localeCompare(b.deliveryAddress ?? "")
  );
}

function generateRoutePlan(orders: EligibleOrder[]): Array<{ mainNeighborhood: string; orders: EligibleOrder[] }> {
  const assigned = new Set<number>();
  const routes: Array<{ mainNeighborhood: string; orders: EligibleOrder[] }> = [];

  // Group orders by neighborhood
  const byNeighborhood = new Map<string, EligibleOrder[]>();
  for (const order of orders) {
    const n = order.deliveryNeighborhood ?? "Outros";
    if (!byNeighborhood.has(n)) byNeighborhood.set(n, []);
    byNeighborhood.get(n)!.push(order);
  }

  // Sort neighborhoods by order count descending (process larger groups first)
  const neighborhoods = [...byNeighborhood.keys()].sort(
    (a, b) => byNeighborhood.get(b)!.length - byNeighborhood.get(a)!.length
  );

  for (const neighborhood of neighborhoods) {
    const available = byNeighborhood.get(neighborhood)!.filter((o) => !assigned.has(o.id));
    if (available.length === 0) continue;

    // Process in batches of MAX_PER_ROUTE
    let batch = sortByAddress(available).slice(0, MAX_PER_ROUTE);
    batch.forEach((o) => assigned.add(o.id));

    // If room remains, fill with adjacent neighborhood orders
    if (batch.length < MAX_PER_ROUTE) {
      const neighbors = getNeighbors(neighborhood);
      for (const neighbor of neighbors) {
        if (batch.length >= MAX_PER_ROUTE) break;
        const neighborOrders = (byNeighborhood.get(neighbor) ?? [])
          .filter((o) => !assigned.has(o.id));
        if (neighborOrders.length === 0) continue;
        const toAdd = sortByAddress(neighborOrders).slice(0, MAX_PER_ROUTE - batch.length);
        toAdd.forEach((o) => assigned.add(o.id));
        batch = [...batch, ...toAdd];
      }
    }

    routes.push({ mainNeighborhood: neighborhood, orders: batch });

    // If there are more orders from the same neighborhood (> MAX_PER_ROUTE), create another route
    const remaining = available.filter((o) => !assigned.has(o.id));
    if (remaining.length > 0) {
      const nextBatch = sortByAddress(remaining).slice(0, MAX_PER_ROUTE);
      nextBatch.forEach((o) => assigned.add(o.id));
      routes.push({ mainNeighborhood: neighborhood, orders: nextBatch });
    }
  }

  return routes;
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

router.get("/delivery/routes", async (_req, res): Promise<void> => {
  const routes = await db
    .select()
    .from(deliveryRoutesTable)
    .orderBy(sql`${deliveryRoutesTable.createdAt} DESC`);

  const full = await Promise.all(routes.map((r) => getRouteWithOrders(r.id)));
  res.json(full.filter(Boolean));
});

router.post("/delivery/routes/generate", async (req, res): Promise<void> => {
  // Find orders already in active routes (not completed)
  const activeRoutes = await db
    .select({ id: deliveryRoutesTable.id })
    .from(deliveryRoutesTable)
    .where(notInArray(deliveryRoutesTable.status, ["completed"]));

  const activeRouteIds = activeRoutes.map((r) => r.id);

  let alreadyInRouteOrderIds: number[] = [];
  if (activeRouteIds.length > 0) {
    const existingRouteOrders = await db
      .select({ orderId: deliveryRouteOrdersTable.orderId })
      .from(deliveryRouteOrdersTable)
      .where(inArray(deliveryRouteOrdersTable.routeId, activeRouteIds));
    alreadyInRouteOrderIds = existingRouteOrders.map((ro) => ro.orderId);
  }

  // Eligible orders: delivery type, deliveryStatus=ready, not already in active route, not cancelled
  let query = db
    .select({
      id: ordersTable.id,
      deliveryAddress: ordersTable.deliveryAddress,
      deliveryNeighborhood: ordersTable.deliveryNeighborhood,
      deliveryFee: ordersTable.deliveryFee,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.type, "delivery"),
        eq(ordersTable.deliveryStatus, "ready"),
        notInArray(ordersTable.status, ["cancelled"])
      )
    );

  let eligibleOrders = await query;

  if (alreadyInRouteOrderIds.length > 0) {
    eligibleOrders = eligibleOrders.filter((o) => !alreadyInRouteOrderIds.includes(o.id));
  }

  if (eligibleOrders.length === 0) {
    res.json({ created: 0, routes: [] });
    return;
  }

  const plan = generateRoutePlan(eligibleOrders as EligibleOrder[]);

  // Count existing routes today to name them sequentially
  const existingCount = await db
    .select({ id: deliveryRoutesTable.id })
    .from(deliveryRoutesTable)
    .where(sql`DATE(${deliveryRoutesTable.createdAt}) = CURRENT_DATE`);

  let colorIndex = existingCount.length % ROUTE_COLORS.length;
  let routeNumber = existingCount.length + 1;

  const createdRoutes = [];

  for (const { mainNeighborhood, orders } of plan) {
    const includedNeighborhoods = [...new Set(orders.map((o) => o.deliveryNeighborhood ?? "Outros"))];
    const color = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];
    const name = `Rota ${routeNumber} — ${mainNeighborhood}`;

    // Calculate stop orders: main neighborhood first, then others, each group sorted by address
    const mainOrders = sortByAddress(orders.filter((o) => (o.deliveryNeighborhood ?? "Outros") === mainNeighborhood));
    const otherOrders = sortByAddress(orders.filter((o) => (o.deliveryNeighborhood ?? "Outros") !== mainNeighborhood));
    const sortedOrders = [...mainOrders, ...otherOrders];

    const mapsUrl = buildMapsUrl(sortedOrders);

    const [route] = await db
      .insert(deliveryRoutesTable)
      .values({
        name,
        mainNeighborhood,
        includedNeighborhoods: JSON.stringify(includedNeighborhoods),
        status: "available",
        color,
        storeOrigin: STORE_ORIGIN.address,
        mapsUrl,
      })
      .returning();

    // Insert route orders with stop order
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

router.post("/delivery/routes/:id/assign", async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id ?? "", 10);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route id" }); return; }

  const courierName = typeof req.body?.courierName === "string" ? req.body.courierName.trim() : "";
  if (!courierName) { res.status(400).json({ error: "courierName is required" }); return; }

  const [route] = await db.select().from(deliveryRoutesTable).where(eq(deliveryRoutesTable.id, routeId));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  if (route.status !== "available") {
    res.status(400).json({ error: `Cannot assign route in status '${route.status}'` });
    return;
  }

  await db.update(deliveryRoutesTable)
    .set({ status: "in_progress", courierName, startedAt: new Date() })
    .where(eq(deliveryRoutesTable.id, routeId));

  // Mark all orders in this route as out_for_delivery
  const routeOrders = await db
    .select({ orderId: deliveryRouteOrdersTable.orderId })
    .from(deliveryRouteOrdersTable)
    .where(eq(deliveryRouteOrdersTable.routeId, routeId));

  if (routeOrders.length > 0) {
    await db
      .update(ordersTable)
      .set({ deliveryStatus: "out_for_delivery" })
      .where(inArray(ordersTable.id, routeOrders.map((ro) => ro.orderId)));
  }

  const full = await getRouteWithOrders(routeId);
  res.json(full);
});

router.post("/delivery/routes/:id/complete", async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id ?? "", 10);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route id" }); return; }

  const [route] = await db.select().from(deliveryRoutesTable).where(eq(deliveryRoutesTable.id, routeId));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  if (route.status !== "in_progress") {
    res.status(400).json({ error: `Cannot complete route in status '${route.status}'` });
    return;
  }

  await db.update(deliveryRoutesTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(deliveryRoutesTable.id, routeId));

  // Mark all orders in this route as delivered
  const routeOrders = await db
    .select({ orderId: deliveryRouteOrdersTable.orderId })
    .from(deliveryRouteOrdersTable)
    .where(eq(deliveryRouteOrdersTable.routeId, routeId));

  if (routeOrders.length > 0) {
    await db
      .update(ordersTable)
      .set({ deliveryStatus: "delivered" })
      .where(inArray(ordersTable.id, routeOrders.map((ro) => ro.orderId)));
  }

  const full = await getRouteWithOrders(routeId);
  res.json(full);
});

export default router;
