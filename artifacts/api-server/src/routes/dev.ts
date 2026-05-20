import { Router, type IRouter } from "express";
import { db, deliveryRouteOrdersTable, deliveryRoutesTable, kitchenTicketsTable, paymentsTable, orderItemsTable, ordersTable } from "@workspace/db";

const router: IRouter = Router();

// ─── POST /dev/reset ──────────────────────────────────────────────────────────
// Apaga todos os pedidos, rotas e dados transacionais do dia.
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
  await db.delete(paymentsTable);
  await db.delete(orderItemsTable);
  await db.delete(ordersTable);

  req.log.info("dev reset: all transactional data cleared");
  res.json({ ok: true, message: "Dados zerados com sucesso." });
});

export default router;
