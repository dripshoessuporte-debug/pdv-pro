import { Router } from "express";
import { db, couriersTable, deliveryRoutesTable, deliveryRouteOrdersTable, ordersTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";

const router = Router();

// GET /couriers
router.get("/couriers", async (req, res): Promise<void> => {
  const all = req.query.all === "true";
  const rows = await db
    .select()
    .from(couriersTable)
    .where(all ? undefined : eq(couriersTable.active, "true"))
    .orderBy(couriersTable.name);
  res.json(rows);
});

// POST /couriers
router.post("/couriers", async (req, res): Promise<void> => {
  const { name, phone, vehicle } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name é obrigatório" });
    return;
  }
  const [courier] = await db
    .insert(couriersTable)
    .values({
      name: name.trim(),
      phone: typeof phone === "string" ? phone.trim() || null : null,
      vehicle: typeof vehicle === "string" && vehicle.trim() ? vehicle.trim() : "moto",
    })
    .returning();
  req.log.info({ courierId: courier.id }, "courier created");
  res.status(201).json(courier);
});

// PUT /couriers/:id
router.put("/couriers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }

  const { name, phone, vehicle, active } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) updates.name = name.trim();
  if (phone !== undefined) updates.phone = typeof phone === "string" ? phone.trim() || null : null;
  if (typeof vehicle === "string" && vehicle.trim()) updates.vehicle = vehicle.trim();
  if (typeof active === "string") updates.active = active;

  const [updated] = await db
    .update(couriersTable)
    .set(updates)
    .where(eq(couriersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Motoboy não encontrado" }); return; }
  res.json(updated);
});

// DELETE /couriers/:id — soft delete
router.delete("/couriers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  await db.update(couriersTable).set({ active: "false" }).where(eq(couriersTable.id, id));
  req.log.info({ courierId: id }, "courier deactivated");
  res.json({ ok: true });
});

// GET /couriers/:id/report — histórico de entregas e ganhos
router.get("/couriers/:id/report", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }

  const [courier] = await db
    .select()
    .from(couriersTable)
    .where(eq(couriersTable.id, id))
    .limit(1);
  if (!courier) { res.status(404).json({ error: "Motoboy não encontrado" }); return; }

  const routes = await db
    .select()
    .from(deliveryRoutesTable)
    .where(and(
      eq(deliveryRoutesTable.courierId, id),
      eq(deliveryRoutesTable.status, "completed"),
    ))
    .orderBy(desc(deliveryRoutesTable.completedAt));

  const routeDetails = await Promise.all(
    routes.map(async (route) => {
      const routeOrders = await db
        .select({ orderId: deliveryRouteOrdersTable.orderId })
        .from(deliveryRouteOrdersTable)
        .where(eq(deliveryRouteOrdersTable.routeId, route.id));

      const orderIds = routeOrders.map((ro) => ro.orderId);
      let totalFee = 0;

      if (orderIds.length > 0) {
        const orderRows = await db
          .select({ deliveryFee: ordersTable.deliveryFee })
          .from(ordersTable)
          .where(inArray(ordersTable.id, orderIds));
        totalFee = orderRows.reduce((sum, o) => sum + parseFloat(String(o.deliveryFee ?? "0")), 0);
      }

      return {
        routeId: route.id,
        routeName: route.name,
        mainNeighborhood: route.mainNeighborhood,
        completedAt: route.completedAt,
        startedAt: route.startedAt,
        deliveryCount: orderIds.length,
        totalFee,
      };
    }),
  );

  const totalDeliveries = routeDetails.reduce((s, r) => s + r.deliveryCount, 0);
  const totalEarnings = routeDetails.reduce((s, r) => s + r.totalFee, 0);

  res.json({ courier, routes: routeDetails, totalDeliveries, totalEarnings });
});

export default router;
