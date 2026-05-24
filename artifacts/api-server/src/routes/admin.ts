import { Router, type IRouter } from "express";
import { and, eq, ilike, inArray } from "drizzle-orm";
import {
  db,
  categoriesTable,
  productsTable,
  tablesTable,
  customersTable,
  couriersTable,
  ordersTable,
  orderItemsTable,
  paymentsTable,
  cashRegistersTable,
  cashMovementsTable,
  kitchenTicketsTable,
  deliveryRoutesTable,
  deliveryRouteOrdersTable,
} from "@workspace/db";
import { requireAdminKey } from "../middleware/security";
import { getOrCreateSettings } from "./settings";

const router: IRouter = Router();
const DEMO_PREFIX = "DEMO::";

router.use(requireAdminKey);

async function resetOperationalData() {
  await db.delete(deliveryRouteOrdersTable);
  await db.delete(deliveryRoutesTable);
  await db.delete(kitchenTicketsTable);
  await db.delete(cashMovementsTable);
  await db.delete(paymentsTable);
  await db.delete(orderItemsTable);
  await db.delete(ordersTable);
  await db.delete(cashRegistersTable);

  await db.update(tablesTable).set({ status: "available", currentOrderId: null });
}

router.post("/admin/reset-production", async (_req, res): Promise<void> => {
  await resetOperationalData();
  res.json({ ok: true, message: "Base de produção limpa: dados operacionais removidos." });
});

router.post("/admin/seed-production", async (_req, res): Promise<void> => {
  await getOrCreateSettings();
  await resetOperationalData();

  const [existingTable] = await db.select({ id: tablesTable.id }).from(tablesTable).limit(1);
  if (!existingTable) {
    await db.insert(tablesTable).values([
      { number: 1, capacity: 4, status: "available", currentOrderId: null },
      { number: 2, capacity: 4, status: "available", currentOrderId: null },
      { number: 3, capacity: 4, status: "available", currentOrderId: null },
    ]);
  }

  res.json({ ok: true, message: "Seed de produção mínima aplicada (base virgem operacional)." });
});

router.post("/admin/clear-demo", async (_req, res): Promise<void> => {
  const demoOrders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.source, "demo"));

  const demoOrderIds = demoOrders.map((o) => o.id);

  if (demoOrderIds.length > 0) {
    await db.delete(deliveryRouteOrdersTable).where(inArray(deliveryRouteOrdersTable.orderId, demoOrderIds));
    await db.delete(cashMovementsTable).where(inArray(cashMovementsTable.orderId, demoOrderIds));
    await db.delete(paymentsTable).where(inArray(paymentsTable.orderId, demoOrderIds));
    await db.delete(kitchenTicketsTable).where(inArray(kitchenTicketsTable.orderId, demoOrderIds));
    await db.delete(orderItemsTable).where(inArray(orderItemsTable.orderId, demoOrderIds));
    await db.delete(ordersTable).where(inArray(ordersTable.id, demoOrderIds));
  }

  const demoRoutes = await db
    .select({ id: deliveryRoutesTable.id })
    .from(deliveryRoutesTable)
    .where(ilike(deliveryRoutesTable.name, `${DEMO_PREFIX}%`));
  const demoRouteIds = demoRoutes.map((r) => r.id);
  if (demoRouteIds.length > 0) {
    await db.delete(deliveryRouteOrdersTable).where(inArray(deliveryRouteOrdersTable.routeId, demoRouteIds));
    await db.delete(deliveryRoutesTable).where(inArray(deliveryRoutesTable.id, demoRouteIds));
  }

  await db.delete(customersTable).where(ilike(customersTable.name, `${DEMO_PREFIX}%`));
  await db.delete(couriersTable).where(ilike(couriersTable.name, `${DEMO_PREFIX}%`));
  await db.delete(productsTable).where(ilike(productsTable.name, `${DEMO_PREFIX}%`));
  await db.delete(categoriesTable).where(ilike(categoriesTable.name, `${DEMO_PREFIX}%`));

  await db.update(tablesTable).set({ status: "available", currentOrderId: null }).where(inArray(tablesTable.number, [901, 902]));

  res.json({ ok: true, message: "Dados demo removidos." });
});

router.post("/admin/seed-demo", async (_req, res): Promise<void> => {
  await getOrCreateSettings();

  const [existingDemoCategory] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(ilike(categoriesTable.name, `${DEMO_PREFIX}%`))
    .limit(1);

  if (existingDemoCategory) {
    res.status(409).json({ error: "Dados demo já existem. Use /admin/clear-demo antes de semear novamente." });
    return;
  }

  const [catLanches, catPizzas, catBebidas, catSobremesas] = await db.insert(categoriesTable).values([
    { name: `${DEMO_PREFIX}Lanches`, description: "Categoria fictícia demo", sortOrder: 1 },
    { name: `${DEMO_PREFIX}Pizzas`, description: "Categoria fictícia demo", sortOrder: 2 },
    { name: `${DEMO_PREFIX}Bebidas`, description: "Categoria fictícia demo", sortOrder: 3 },
    { name: `${DEMO_PREFIX}Sobremesas`, description: "Categoria fictícia demo", sortOrder: 4 },
  ]).returning();

  await db.insert(productsTable).values([
    { name: `${DEMO_PREFIX}X-Burger`, price: "28.90", categoryId: catLanches.id, description: "Produto fictício", active: true, available: true },
    { name: `${DEMO_PREFIX}Pizza Calabresa`, price: "59.90", categoryId: catPizzas.id, description: "Produto fictício", active: true, available: true },
    { name: `${DEMO_PREFIX}Refrigerante 2L`, price: "12.00", categoryId: catBebidas.id, description: "Produto fictício", active: true, available: true },
    { name: `${DEMO_PREFIX}Brownie`, price: "16.00", categoryId: catSobremesas.id, description: "Produto fictício", active: true, available: true },
  ]);

  await db.insert(tablesTable).values([
    { number: 901, capacity: 4, status: "available", currentOrderId: null },
    { number: 902, capacity: 2, status: "available", currentOrderId: null },
  ]).onConflictDoNothing();

  const [customer1, customer2] = await db.insert(customersTable).values([
    { name: `${DEMO_PREFIX}Cliente Balcão`, phone: "(00) 90000-0001", email: "demo-balcao@example.com" },
    { name: `${DEMO_PREFIX}Cliente Delivery`, phone: "(00) 90000-0002", email: "demo-delivery@example.com" },
  ]).returning();

  const [courier] = await db.insert(couriersTable).values({
    name: `${DEMO_PREFIX}Motoboy Exemplo`, phone: "(00) 98888-0000", vehicle: "moto", active: "true",
  }).returning();

  const [cash] = await db.insert(cashRegistersTable).values({
    operator: `${DEMO_PREFIX}Operador`, openingAmount: "150.00", status: "open", notes: "Caixa fictício demo",
  }).returning();

  const [orderCounter, orderTable, orderDelivery] = await db.insert(ordersTable).values([
    { type: "counter", status: "open", customerName: customer1.name, totalAmount: "28.90", source: "demo" },
    { type: "table", status: "preparing", tableId: 901, customerName: `${DEMO_PREFIX}Mesa 901`, totalAmount: "59.90", source: "demo" },
    { type: "delivery", status: "preparing", customerId: customer2.id, customerName: customer2.name, customerPhone: customer2.phone, deliveryAddress: "Rua Exemplo", deliveryNeighborhood: "Bairro Exemplo", deliveryCep: "01001-000", deliveryFee: "8.00", totalAmount: "74.00", deliveryStatus: "ready", source: "demo" },
  ]).returning();

  await db.insert(paymentsTable).values([
    { orderId: orderCounter.id, amount: "28.90", method: "pix", status: "approved" },
  ]);

  await db.insert(cashMovementsTable).values([
    { cashRegisterId: cash.id, type: "payment", amount: "28.90", paymentMethod: "pix", reason: "Venda demo", orderId: orderCounter.id },
    { cashRegisterId: cash.id, type: "suprimento", amount: "50.00", paymentMethod: "cash", reason: "Suprimento demo" },
  ]);

  const [route] = await db.insert(deliveryRoutesTable).values({
    name: `${DEMO_PREFIX}Rota 1`, mainNeighborhood: "Bairro Exemplo", includedNeighborhoods: JSON.stringify(["Bairro Exemplo"]), status: "available", color: "#3b82f6", courierId: courier.id, courierName: courier.name, storeOrigin: "Origem Demo", mapsUrl: "https://www.google.com/maps", dispatchDeadline: new Date(Date.now() + 20 * 60_000),
  }).returning();

  await db.insert(deliveryRouteOrdersTable).values({ routeId: route.id, orderId: orderDelivery.id, stopOrder: 1 });

  await db.insert(kitchenTicketsTable).values([
    { orderId: orderTable.id, status: "preparing" },
    { orderId: orderDelivery.id, status: "ready" },
  ]);

  res.json({ ok: true, message: "Seed demo criado com sucesso." });
});

export default router;
