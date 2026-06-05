import { Router, type IRouter } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  db,
  cashMovementsTable,
  deliveryRouteOrdersTable,
  deliveryRoutesTable,
  kitchenTicketsTable,
  orderItemAddonsTable,
  paymentsTable,
  orderItemsTable,
  ordersTable,
  productsTable,
  productVariantsTable,
} from "@workspace/db";
import {
  isUsingDevAdminFallback,
  requireDevToolAccess,
} from "../middleware/security";
import { getCurrentActor } from "../middleware/rbac";

const router: IRouter = Router();

router.get("/dev/tool-status", requireDevToolAccess, (req, res): void => {
  res.json({
    ok: true,
    receivedAdminKey: Boolean(req.headers["x-admin-key"]),
    usingFallback: isUsingDevAdminFallback(req),
    host: req.headers.host ?? "",
    origin: req.headers.origin ?? "",
    referer: req.headers.referer ?? "",
    nodeEnv: process.env.NODE_ENV ?? "",
    enableDevRoutes: process.env.ENABLE_DEV_ROUTES ?? "",
    allowDevAdminFallback: process.env.ALLOW_DEV_ADMIN_FALLBACK ?? "",
  });
});

// ─── POST /dev/reset ──────────────────────────────────────────────────────────
// Apaga pedidos, rotas e dados transacionais da loja atual.
// Mantém: clientes, cardápio, mesas, configurações, caixa.

router.post(
  "/dev/reset",
  requireDevToolAccess,
  async (req, res): Promise<void> => {
    const confirm = req.body?.confirm;
    if (confirm !== "ZERAR") {
      res
        .status(400)
        .json({ error: "Envie { confirm: 'ZERAR' } para confirmar." });
      return;
    }

    const { storeId } = await getCurrentActor(req);
    const orderIds = db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.storeId, storeId));
    const routeIds = db
      .select({ id: deliveryRoutesTable.id })
      .from(deliveryRoutesTable)
      .where(eq(deliveryRoutesTable.storeId, storeId));
    const orderItemIds = db
      .select({ id: orderItemsTable.id })
      .from(orderItemsTable)
      .where(inArray(orderItemsTable.orderId, orderIds));

    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(deliveryRouteOrdersTable)
          .where(
            or(
              inArray(deliveryRouteOrdersTable.orderId, orderIds),
              inArray(deliveryRouteOrdersTable.routeId, routeIds),
            ),
          );
        await tx
          .delete(deliveryRoutesTable)
          .where(eq(deliveryRoutesTable.storeId, storeId));
        await tx
          .delete(kitchenTicketsTable)
          .where(inArray(kitchenTicketsTable.orderId, orderIds));
        await tx
          .delete(cashMovementsTable)
          .where(inArray(cashMovementsTable.orderId, orderIds));
        await tx
          .delete(paymentsTable)
          .where(inArray(paymentsTable.orderId, orderIds));
        await tx
          .delete(orderItemAddonsTable)
          .where(inArray(orderItemAddonsTable.orderItemId, orderItemIds));
        await tx
          .delete(orderItemsTable)
          .where(inArray(orderItemsTable.orderId, orderIds));
        await tx.delete(ordersTable).where(eq(ordersTable.storeId, storeId));
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "erro desconhecido";
      req.log.error(
        { err: error, storeId },
        "dev reset: failed to clear transactional data",
      );
      res.status(500).json({
        error: `Erro ao zerar dados transacionais: ${message}`,
      });
      return;
    }

    req.log.info({ storeId }, "dev reset: transactional data cleared");
    res.json({ ok: true, message: "Dados zerados com sucesso." });
  },
);

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

router.post(
  "/dev/create-test-orders",
  requireDevToolAccess,
  async (req, res): Promise<void> => {
    const { storeId } = await getCurrentActor(req);
    const specs: TestOrderSpec[] = req.body?.orders;
    if (!Array.isArray(specs) || specs.length === 0) {
      res
        .status(400)
        .json({ error: "Envie { orders: [...] } com ao menos 1 pedido." });
      return;
    }

    const results: { orderId: number }[] = [];

    for (const spec of specs) {
      const kitchenAcceptedAt = new Date(Date.now() - spec.minutesAgo * 60_000);

      const [order] = await db
        .insert(ordersTable)
        .values({
          storeId,
          status: "preparing",
          type: "delivery",
          customerName: spec.name,
          customerPhone: spec.phone,
          deliveryCep: spec.cep
            .replace(/\D/g, "")
            .replace(/^(\d{5})(\d{3})$/, "$1-$2"),
          deliveryAddress: spec.address,
          deliveryNeighborhood: spec.neighborhood,
          deliveryFee: "5.00",
          totalAmount: String(spec.total ?? 38),
          paymentTiming: "now",
          deliveryStatus: "preparing",
          kitchenAcceptedAt,
          source: "dev_seed",
        })
        .returning({ id: ordersTable.id });

      results.push({ orderId: order.id });
    }

    req.log.info(
      { storeId, count: results.length },
      "dev create-test-orders: created",
    );
    res.json({ created: results.length, results });
  },
);

type SeedProduct = {
  id: number;
  name: string;
  price: string;
};

type SeedVariant = {
  id: number;
  productId: number;
  name: string;
  price: string;
};

type SeedItemTemplate = {
  name: string;
  quantity: number;
  unitPrice: number;
};

const curitibaDeliveryAddresses = [
  {
    neighborhood: "Bacacheri",
    cep: "82510-000",
    address: "Rua Nicarágua, 1200",
    fee: 7.9,
  },
  {
    neighborhood: "Boa Vista",
    cep: "82560-000",
    address: "Avenida Paraná, 3450",
    fee: 8.5,
  },
  {
    neighborhood: "Santa Cândida",
    cep: "82640-000",
    address: "Rua Theodoro Makiolka, 980",
    fee: 9.5,
  },
  {
    neighborhood: "Atuba",
    cep: "82630-000",
    address: "Rua Margarida de Conto Gava, 275",
    fee: 8.9,
  },
  {
    neighborhood: "Tingui",
    cep: "82620-000",
    address: "Rua Fredolin Wolf, 640",
    fee: 8.75,
  },
  {
    neighborhood: "Bairro Alto",
    cep: "82820-000",
    address: "Rua Alberico Flores Bueno, 1510",
    fee: 9.25,
  },
  {
    neighborhood: "Tarumã",
    cep: "82800-000",
    address: "Avenida Victor Ferreira do Amaral, 2200",
    fee: 7.5,
  },
  {
    neighborhood: "Capão da Imbuia",
    cep: "82810-000",
    address: "Rua Delegado Leopoldo Belczak, 1330",
    fee: 7.75,
  },
  {
    neighborhood: "Cajuru",
    cep: "82900-000",
    address: "Rua Roraima, 420",
    fee: 8.25,
  },
  {
    neighborhood: "Uberaba",
    cep: "81560-000",
    address: "Avenida Senador Salgado Filho, 4850",
    fee: 10.5,
  },
];

const fallbackItemTemplates: SeedItemTemplate[] = [
  { name: "Pizza Calabresa", quantity: 1, unitPrice: 42 },
  { name: "Pizza Frango", quantity: 1, unitPrice: 44 },
  { name: "X-Bacon", quantity: 1, unitPrice: 28 },
  { name: "Combo Hambúrguer", quantity: 1, unitPrice: 36 },
  { name: "Refrigerante", quantity: 2, unitPrice: 8 },
  { name: "Batata Frita", quantity: 1, unitPrice: 18 },
  { name: "Pizza Grande", quantity: 1, unitPrice: 58 },
  { name: "Combo Casal", quantity: 1, unitPrice: 72 },
];

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function formatCep(cep: string): string {
  return cep.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2");
}

function getSeedCount(value: unknown): number {
  if (value == null || value === "") return 20;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(parsed, 100);
}

router.post(
  "/dev/seed-curitiba-delivery-orders",
  requireDevToolAccess,
  async (req, res): Promise<void> => {
    if (req.body?.confirm !== "CRIAR") {
      res
        .status(400)
        .json({ error: "Envie { confirm: 'CRIAR' } para confirmar." });
      return;
    }

    const { storeId } = await getCurrentActor(req);
    const count = getSeedCount(req.body?.count);

    const products = (await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
      })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.storeId, storeId),
          eq(productsTable.active, true),
          eq(productsTable.available, true),
        ),
      )) as SeedProduct[];

    const productIds = products.map((product) => product.id);
    const variants = productIds.length
      ? ((await db
          .select({
            id: productVariantsTable.id,
            productId: productVariantsTable.productId,
            name: productVariantsTable.name,
            price: productVariantsTable.price,
          })
          .from(productVariantsTable)
          .where(
            and(
              inArray(productVariantsTable.productId, productIds),
              eq(productVariantsTable.storeId, storeId),
              eq(productVariantsTable.active, true),
              eq(productVariantsTable.available, true),
            ),
          )) as SeedVariant[])
      : [];

    const variantsByProduct = new Map<number, SeedVariant>();
    for (const variant of variants) {
      if (!variantsByProduct.has(variant.productId)) {
        variantsByProduct.set(variant.productId, variant);
      }
    }

    const created: { orderId: number; items: number }[] = [];

    await db.transaction(async (tx) => {
      for (let i = 0; i < count; i += 1) {
        const address =
          curitibaDeliveryAddresses[i % curitibaDeliveryAddresses.length];
        const orderNumber = String(i + 1).padStart(2, "0");
        const deliveryFee = address.fee;
        const itemCount = (i % 3) + 1;
        const selectedItems = Array.from(
          { length: itemCount },
          (_, itemIndex) => {
            const product = products.length
              ? products[(i + itemIndex) % products.length]
              : null;
            const fallback =
              fallbackItemTemplates[
                (i + itemIndex) % fallbackItemTemplates.length
              ];
            const variant = product
              ? (variantsByProduct.get(product.id) ?? null)
              : null;
            const quantity = itemIndex === 0 ? fallback.quantity : 1;
            const unitPrice = product
              ? Number.parseFloat(String(variant?.price ?? product.price))
              : fallback.unitPrice;

            return {
              product,
              variant,
              fallback,
              quantity,
              unitPrice,
              totalPrice: unitPrice * quantity,
            };
          },
        );
        const itemsTotal = selectedItems.reduce(
          (sum, item) => sum + item.totalPrice,
          0,
        );
        const totalAmount = itemsTotal + deliveryFee;
        const now = new Date();
        const kitchenAcceptedAt = new Date(
          now.getTime() - ((i % 10) + 1) * 60_000,
        );

        const [order] = await tx
          .insert(ordersTable)
          .values({
            storeId,
            status: "preparing",
            type: "delivery",
            customerName: `Cliente Teste ${orderNumber}`,
            customerPhone: `(41) 9${String(88000000 + i).slice(0, 8)}`,
            deliveryCep: formatCep(address.cep),
            deliveryAddress: `${address.address}, ap ${100 + i}`,
            deliveryNeighborhood: address.neighborhood,
            deliveryReference:
              "Pedido temporário criado pela ferramenta de desenvolvimento.",
            deliveryFee: formatMoney(deliveryFee),
            totalAmount: formatMoney(totalAmount),
            paymentTiming: i % 2 === 0 ? "now" : "on_delivery",
            deliveryPaymentMethod: i % 2 === 0 ? null : "pix",
            deliveryStatus: "preparing",
            kitchenAcceptedAt,
            source: "dev_seed",
            integrationStatus: "received",
            deliveryFeeCalculated: "false",
            deliveryFeeSource: "manual",
            deliveryDistanceSource: "approximate_cep",
          })
          .returning({ id: ordersTable.id });

        await tx.insert(orderItemsTable).values(
          selectedItems.map((item) => ({
            orderId: order.id,
            productId: item.product?.id ?? null,
            variantId: item.variant?.id ?? null,
            variantName: item.variant?.name ?? null,
            variantPrice: item.variant ? formatMoney(item.unitPrice) : null,
            externalProductName: item.product ? null : item.fallback.name,
            quantity: item.quantity,
            unitPrice: formatMoney(item.unitPrice),
            totalPrice: formatMoney(item.totalPrice),
          })),
        );

        await tx.insert(kitchenTicketsTable).values({
          orderId: order.id,
          status: "pending",
          createdAt: kitchenAcceptedAt,
        });

        created.push({ orderId: order.id, items: selectedItems.length });
      }
    });

    req.log.info(
      { storeId, count: created.length },
      "dev seed-curitiba-delivery-orders: created",
    );
    res.json({ created: created.length, results: created });
  },
);

export default router;
