import { Router, type IRouter } from "express";
import {
  db,
  cashMovementsTable,
  deliveryRouteOrdersTable,
  deliveryRoutesTable,
  kitchenTicketsTable,
  orderItemsTable,
  ordersTable,
  paymentsTable,
} from "@workspace/db";
import {
  requireAdminKey,
  requireDevRoutesEnabled,
} from "../middleware/security";
import { getCurrentActor } from "../middleware/rbac";

const router: IRouter = Router();

async function clearTransactionalData(): Promise<void> {
  await db.delete(deliveryRouteOrdersTable);
  await db.delete(deliveryRoutesTable);
  await db.delete(kitchenTicketsTable);
  await db.delete(cashMovementsTable);
  await db.delete(paymentsTable);
  await db.delete(orderItemsTable);
  await db.delete(ordersTable);
}

router.post(
  "/admin/clear-demo",
  requireDevRoutesEnabled,
  requireAdminKey,
  async (_req, res): Promise<void> => {
    await clearTransactionalData();
    res.json({ ok: true, message: "Demo limpo." });
  },
);

router.post(
  "/admin/seed-demo",
  requireDevRoutesEnabled,
  requireAdminKey,
  async (req, res): Promise<void> => {
    await clearTransactionalData();
    const { storeId } = await getCurrentActor(req);

    const now = Date.now();
    const demoOrders = [
      {
        name: "Cliente Demo 1",
        phone: "11999990001",
        address: "Rua A, 10",
        neighborhood: "Centro",
        cep: "01001-000",
        minutesAgo: 45,
        total: 54,
      },
      {
        name: "Cliente Demo 2",
        phone: "11999990002",
        address: "Rua B, 20",
        neighborhood: "Centro",
        cep: "01002-000",
        minutesAgo: 20,
        total: 39,
      },
    ];

    for (const item of demoOrders) {
      await db.insert(ordersTable).values({
        storeId,
        type: "delivery",
        customerName: item.name,
        customerPhone: item.phone,
        deliveryCep: item.cep,
        deliveryAddress: item.address,
        deliveryNeighborhood: item.neighborhood,
        deliveryFee: "6.00",
        totalAmount: String(item.total),
        paymentTiming: "now",
        deliveryStatus: "preparing",
        kitchenAcceptedAt: new Date(now - item.minutesAgo * 60_000),
      });
    }

    res.json({ ok: true, seeded: demoOrders.length });
  },
);

router.post(
  "/admin/reset-production",
  requireAdminKey,
  async (_req, res): Promise<void> => {
    await clearTransactionalData();
    res.json({ ok: true, message: "Dados transacionais zerados." });
  },
);

router.post(
  "/admin/seed-production",
  requireAdminKey,
  async (_req, res): Promise<void> => {
    res.status(400).json({
      ok: false,
      error:
        "seed-production não cria dados automáticos. Use migrations + scripts de carga controlada.",
    });
  },
);

export default router;
