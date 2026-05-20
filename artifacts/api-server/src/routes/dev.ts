import { Router, type IRouter } from "express";
import { db, cashMovementsTable, deliveryRouteOrdersTable, deliveryRoutesTable, kitchenTicketsTable, paymentsTable, orderItemsTable, ordersTable } from "@workspace/db";

const router: IRouter = Router();

// ─── POST /dev/reset ──────────────────────────────────────────────────────────
// Apaga todos os pedidos, rotas e dados transacionais.
// Mantém: clientes, cardápio, mesas, configurações, caixa.

router.post("/dev/reset", async (req, res): Promise<void> => {
  const confirm = req.body?.confirm;
  if (confirm !== "ZERAR") {
    res.status(400).json({ error: "Envie { confirm: 'ZERAR' } para confirmar." });
    return;
  }

  await db.delete(deliveryRouteOrdersTable);
  await db.delete(deliveryRoutesTable);
  await db.delete(kitchenTicketsTable);
  // cashMovements may reference orders (orderId FK) — delete first
  await db.delete(cashMovementsTable);
  await db.delete(paymentsTable);
  await db.delete(orderItemsTable);
  await db.delete(ordersTable);

  req.log.info("dev reset: all transactional data cleared");
  res.json({ ok: true, message: "Dados zerados com sucesso." });
});

// ─── POST /dev/create-test-orders ─────────────────────────────────────────────
// Cria pedidos de delivery de teste com kitchenAcceptedAt retroativo.
// Body: { orders: Array<{ name, phone, address, neighborhood, cep, minutesAgo, total? }> }

interface TestOrderSpec {
  name: string;
  phone: string;
  address: string;
  neighborhood: string;
  cep: string;
  minutesAgo: number;
  total?: number;
}

router.post("/dev/create-test-orders", async (req, res): Promise<void> => {
  const specs: TestOrderSpec[] = req.body?.orders;
  if (!Array.isArray(specs) || specs.length === 0) {
    res.status(400).json({ error: "Envie { orders: [...] } com ao menos 1 pedido." });
    return;
  }

  const results: { orderId: number }[] = [];

  for (const spec of specs) {
    const kitchenAcceptedAt = new Date(Date.now() - spec.minutesAgo * 60_000);

    const [order] = await db
      .insert(ordersTable)
      .values({
        type: "delivery",
        customerName: spec.name,
        customerPhone: spec.phone,
        deliveryCep: spec.cep.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2"),
        deliveryAddress: spec.address,
        deliveryNeighborhood: spec.neighborhood,
        deliveryFee: "5.00",
        totalAmount: String(spec.total ?? 38),
        paymentTiming: "now",
        deliveryStatus: "preparing",
        kitchenAcceptedAt,
      })
      .returning({ id: ordersTable.id });

    results.push({ orderId: order.id });
  }

  req.log.info({ count: results.length }, "dev create-test-orders: created");
  res.json({ created: results.length, results });
});

export default router;
