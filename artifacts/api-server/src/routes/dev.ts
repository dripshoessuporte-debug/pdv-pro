import { Router, type IRouter } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  db,
  cashRegistersTable,
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
import {
  calculateDeliveryDistanceForStore,
  deliveryCalculationErrorStatus,
} from "../lib/delivery-distance-calculator";

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
      let distanceResult: Awaited<ReturnType<typeof calculateDeliveryDistanceForStore>>;
      try {
        distanceResult = await calculateDeliveryDistanceForStore({
          storeId,
          customerCep: spec.cep,
          customerAddress: spec.address,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(deliveryCalculationErrorStatus(error)).json({ error: message });
        return;
      }
      const configuredFee = distanceResult.deliveryFeeCalculated && distanceResult.deliveryFee != null
        ? distanceResult.deliveryFee
        : 5;
      const totalAmount = Number(spec.total ?? 38);

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
          deliveryFee: formatMoney(configuredFee),
          totalAmount: formatMoney(totalAmount - 5 + configuredFee),
          paymentTiming: "now",
          deliveryStatus: "preparing",
          kitchenAcceptedAt,
          source: "dev_seed",
          estimatedDistanceKm: String(distanceResult.estimatedDistanceKm),
          deliveryFeeCalculated: String(distanceResult.deliveryFeeCalculated),
          deliveryFeeSource: distanceResult.deliveryFeeCalculated ? distanceResult.source : "manual",
          deliveryDistanceSource: distanceResult.source,
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
  // Bloco 1: Jardim das Américas — quatro pedidos próximos no tempo.
  {
    neighborhood: "Jardim das Américas",
    cep: "81530-000",
    address: "Rua Professor João Doetzer, 610",
    fee: 7.5,
  },
  {
    neighborhood: "Jardim das Américas",
    cep: "81540-000",
    address: "Rua Frei Henrique de Coimbra, 420",
    fee: 7.5,
  },
  {
    neighborhood: "Jardim das Américas",
    cep: "81530-120",
    address: "Avenida Nossa Senhora de Lourdes, 980",
    fee: 7.75,
  },
  {
    neighborhood: "Jardim das Américas",
    cep: "81530-290",
    address: "Rua Tenente Ricardo Kirch, 145",
    fee: 7.75,
  },
  // Logo depois do bloco Jardim das Américas.
  {
    neighborhood: "Cajuru",
    cep: "82900-000",
    address: "Rua Roraima, 420",
    fee: 8.25,
  },
  // Bloco Uberaba.
  {
    neighborhood: "Uberaba",
    cep: "81560-000",
    address: "Avenida Senador Salgado Filho, 4850",
    fee: 10.5,
  },
  {
    neighborhood: "Uberaba",
    cep: "81560-210",
    address: "Rua Velcy Bolivar Grandó, 620",
    fee: 10.25,
  },
  {
    neighborhood: "Uberaba",
    cep: "81570-000",
    address: "Rua Capitão Leônidas Marques, 1580",
    fee: 10.75,
  },
  // Bloco Capão da Imbuia.
  {
    neighborhood: "Capão da Imbuia",
    cep: "82810-000",
    address: "Rua Delegado Leopoldo Belczak, 1330",
    fee: 7.75,
  },
  {
    neighborhood: "Capão da Imbuia",
    cep: "82810-220",
    address: "Rua Professor Nivaldo Braga, 980",
    fee: 7.9,
  },
  {
    neighborhood: "Capão da Imbuia",
    cep: "82810-340",
    address: "Rua Paulo Setúbal, 2500",
    fee: 8.1,
  },
  // Bloco Tarumã.
  {
    neighborhood: "Tarumã",
    cep: "82800-000",
    address: "Avenida Victor Ferreira do Amaral, 2200",
    fee: 7.5,
  },
  {
    neighborhood: "Tarumã",
    cep: "82800-130",
    address: "Rua Konrad Adenauer, 780",
    fee: 7.65,
  },
  // Bloco Bairro Alto.
  {
    neighborhood: "Bairro Alto",
    cep: "82820-000",
    address: "Rua Alberico Flores Bueno, 1510",
    fee: 9.25,
  },
  {
    neighborhood: "Bairro Alto",
    cep: "82840-000",
    address: "Rua Rio Jari, 1120",
    fee: 9.4,
  },
  // Bloco Boa Vista.
  {
    neighborhood: "Boa Vista",
    cep: "82560-000",
    address: "Avenida Paraná, 3450",
    fee: 8.5,
  },
  {
    neighborhood: "Boa Vista",
    cep: "82540-000",
    address: "Rua Lodovico Geronazzo, 1240",
    fee: 8.65,
  },
  // Bloco Bacacheri.
  {
    neighborhood: "Bacacheri",
    cep: "82510-000",
    address: "Rua Nicarágua, 1200",
    fee: 7.9,
  },
  {
    neighborhood: "Bacacheri",
    cep: "82515-260",
    address: "Rua Estados Unidos, 1680",
    fee: 8.1,
  },
  // Fechamento do bloco norte.
  {
    neighborhood: "Santa Cândida",
    cep: "82640-000",
    address: "Rua Theodoro Makiolka, 980",
    fee: 9.5,
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

const seedMinuteGaps = [
  6, 7, 5, 8, 10, 6, 7, 8, 5, 9, 6, 7, 10, 5, 8, 6, 7, 9, 5,
];
const SEED_ORDER_COUNT = curitibaDeliveryAddresses.length;
const ROUTE_TIME_WINDOW_MINUTES = 30;
const SEED_NEWEST_AGE_MINUTES = 5;
const SEED_OPERATIONAL_START_MARGIN_MINUTES = 2;

function getStartOfToday(): Date {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return startOfToday;
}

function buildCompressedSeedMinuteGaps(availableMinutes: number): number[] {
  const gapCount = Math.max(SEED_ORDER_COUNT - 1, 0);
  if (gapCount === 0) return [];

  const targetSpreadMinutes = Math.min(
    Math.max(Math.floor(availableMinutes), gapCount),
    gapCount * 3,
  );
  const gaps = Array.from({ length: gapCount }, () => 1);
  let remainingExtraMinutes = targetSpreadMinutes - gapCount;

  for (let i = 0; i < gaps.length && remainingExtraMinutes > 0; i += 1) {
    const extra = Math.min(2, remainingExtraMinutes);
    gaps[i] += extra;
    remainingExtraMinutes -= extra;
  }

  return gaps;
}

type SeedTimeline = {
  minOperationalStart: Date;
  oldestKitchenAcceptedAt: Date;
  newestKitchenAcceptedAt: Date;
  compressedTimeline: boolean;
  minuteGaps: number[];
  kitchenAcceptedTimes: Date[];
};

function buildSeedTimeline(now: Date, minOperationalStart: Date): SeedTimeline {
  const desiredSpreadMinutes = seedMinuteGaps.reduce(
    (sum, gap) => sum + gap,
    0,
  );
  const idealOldestKitchenAcceptedAt = new Date(
    now.getTime() -
      (desiredSpreadMinutes + SEED_NEWEST_AGE_MINUTES) * 60_000,
  );
  const minimumOldestKitchenAcceptedAt = new Date(
    minOperationalStart.getTime() +
      SEED_OPERATIONAL_START_MARGIN_MINUTES * 60_000,
  );

  const compressedTimeline =
    idealOldestKitchenAcceptedAt < minimumOldestKitchenAcceptedAt;
  const oldestKitchenAcceptedAt = compressedTimeline
    ? minimumOldestKitchenAcceptedAt
    : idealOldestKitchenAcceptedAt;

  const availableMinutesBeforeNow = Math.floor(
    (now.getTime() - 60_000 - oldestKitchenAcceptedAt.getTime()) / 60_000,
  );
  const minuteGaps = compressedTimeline
    ? buildCompressedSeedMinuteGaps(availableMinutesBeforeNow)
    : seedMinuteGaps;

  const kitchenAcceptedTimes = [oldestKitchenAcceptedAt];
  for (const gap of minuteGaps) {
    const previous = kitchenAcceptedTimes[kitchenAcceptedTimes.length - 1];
    kitchenAcceptedTimes.push(
      new Date(previous.getTime() + gap * 60_000),
    );
  }

  return {
    minOperationalStart,
    oldestKitchenAcceptedAt,
    newestKitchenAcceptedAt:
      kitchenAcceptedTimes[kitchenAcceptedTimes.length - 1] ??
      oldestKitchenAcceptedAt,
    compressedTimeline,
    minuteGaps,
    kitchenAcceptedTimes,
  };
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
    const count = SEED_ORDER_COUNT;
    const now = new Date();

    const [openRegister] = await db
      .select({ openedAt: cashRegistersTable.openedAt })
      .from(cashRegistersTable)
      .where(
        and(
          eq(cashRegistersTable.storeId, storeId),
          eq(cashRegistersTable.status, "open"),
        ),
      )
      .orderBy(sql`${cashRegistersTable.openedAt} DESC`)
      .limit(1);

    const minOperationalStart = openRegister?.openedAt
      ? new Date(openRegister.openedAt)
      : getStartOfToday();
    const seedTimeline = buildSeedTimeline(now, minOperationalStart);

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

    const distanceResults: Awaited<
      ReturnType<typeof calculateDeliveryDistanceForStore>
    >[] = [];
    for (let i = 0; i < count; i += 1) {
      const address =
        curitibaDeliveryAddresses[i % curitibaDeliveryAddresses.length];
      try {
        distanceResults.push(
          await calculateDeliveryDistanceForStore({
            storeId,
            customerCep: address.cep,
            customerAddress: address.address,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(deliveryCalculationErrorStatus(error)).json({
          error: message,
          detail:
            "Não foi possível criar deliveries de teste sem distância real. Confira o CEP da loja em Configurações.",
        });
        return;
      }
    }

    const created: {
      orderId: number;
      neighborhood: string;
      createdAt: string;
      kitchenAcceptedAt: string;
      items: number;
      paymentTiming: string;
      deliveryPaymentMethod: string | null;
      needsChange: string;
      changeFor: string | null;
      estimatedDistanceKm: number;
      deliveryFee: number;
    }[] = [];

    await db.transaction(async (tx) => {
      for (let i = 0; i < count; i += 1) {
        const address =
          curitibaDeliveryAddresses[i % curitibaDeliveryAddresses.length];
        const orderNumber = String(i + 1).padStart(2, "0");
        const distanceResult = distanceResults[i];
        const deliveryFee =
          distanceResult.deliveryFeeCalculated && distanceResult.deliveryFee != null
            ? distanceResult.deliveryFee
            : address.fee;
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
        if ([1, 4, 7, 12, 16, 19].includes(i)) {
          selectedItems.push({
            product: null,
            variant: null,
            fallback: { name: "Refrigerante 2L", quantity: 1, unitPrice: 12 },
            quantity: 1,
            unitPrice: 12,
            totalPrice: 12,
          });
        }

        const totalWithBeverage = selectedItems.reduce(
          (sum, item) => sum + item.totalPrice,
          0,
        );
        const finalTotalAmount = totalWithBeverage + deliveryFee;
        const kitchenAcceptedAt = seedTimeline.kitchenAcceptedTimes[i];
        const createdAt = new Date(
          kitchenAcceptedAt.getTime() - (1 + (i % 2)) * 60_000,
        );
        const paymentTiming = i % 3 === 0 ? "now" : "on_delivery";
        const deliveryPaymentMethod = [
          "pix",
          "cartao",
          "dinheiro",
          "pix",
          "cartao",
        ][i % 5];
        const needsChange =
          paymentTiming === "on_delivery" &&
          deliveryPaymentMethod === "dinheiro"
            ? "true"
            : "false";
        const changeFor =
          needsChange === "true"
            ? formatMoney(Math.ceil((finalTotalAmount + 15) / 10) * 10)
            : null;

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
            totalAmount: formatMoney(finalTotalAmount),
            paymentTiming,
            deliveryPaymentMethod,
            needsChange,
            changeFor,
            deliveryPaymentNotes:
              paymentTiming === "now"
                ? "Pedido marcado como pago agora no seed."
                : "Cobrar no momento da entrega.",
            deliveryStatus: "preparing",
            createdAt,
            kitchenAcceptedAt,
            source: "dev_seed",
            integrationStatus: "received",
            estimatedDistanceKm: String(distanceResult.estimatedDistanceKm),
            deliveryFeeCalculated: String(distanceResult.deliveryFeeCalculated),
            deliveryFeeSource: distanceResult.deliveryFeeCalculated
              ? distanceResult.source
              : "manual",
            deliveryDistanceSource: distanceResult.source,
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

        created.push({
          orderId: order.id,
          neighborhood: address.neighborhood,
          createdAt: createdAt.toISOString(),
          kitchenAcceptedAt: kitchenAcceptedAt.toISOString(),
          items: selectedItems.length,
          paymentTiming,
          deliveryPaymentMethod,
          needsChange,
          changeFor,
          estimatedDistanceKm: distanceResult.estimatedDistanceKm,
          deliveryFee,
        });
      }
    });

    req.log.info(
      {
        storeId,
        count: created.length,
        compressedTimeline: seedTimeline.compressedTimeline,
        openRegisterOpenedAt: openRegister?.openedAt?.toISOString() ?? null,
        oldestKitchenAcceptedAt:
          seedTimeline.oldestKitchenAcceptedAt.toISOString(),
        newestKitchenAcceptedAt:
          seedTimeline.newestKitchenAcceptedAt.toISOString(),
      },
      "dev seed-curitiba-delivery-orders: created",
    );
    res.json({
      created: created.length,
      openRegisterOpenedAt: openRegister?.openedAt?.toISOString() ?? null,
      oldestKitchenAcceptedAt:
        seedTimeline.oldestKitchenAcceptedAt.toISOString(),
      newestKitchenAcceptedAt:
        seedTimeline.newestKitchenAcceptedAt.toISOString(),
      compressedTimeline: seedTimeline.compressedTimeline,
      timeGapMinutes: seedTimeline.compressedTimeline
        ? { min: 1, max: 3 }
        : { min: 5, max: 10 },
      routeTimeWindowMinutes: ROUTE_TIME_WINDOW_MINUTES,
      seedMinuteGaps: seedTimeline.minuteGaps,
      results: created,
    });
  },
);

export default router;
