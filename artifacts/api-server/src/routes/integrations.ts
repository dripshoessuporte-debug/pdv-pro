import { Router, type IRouter } from "express";
import { requireAdminKey, requireIntegrationKey } from "../middleware/security";
import { getCurrentActor } from "../middleware/rbac";
import {
  ingestExternalOrder,
  upsertExternalStoreIntegration,
} from "../lib/external-orders";

const router: IRouter = Router();

/**
 * POST /integrations/orders/inbound
 *
 * Recebe pedidos/eventos externos (iFood-ready, WhatsApp, site, totem etc.).
 * O fluxo grava o evento bruto, resolve merchantId externo -> storeId interno,
 * aplica idempotência por storeId+source+externalOrderId e só então persiste
 * pedido/itens/adicionais/pagamento/ticket de cozinha.
 */
router.post(
  "/integrations/orders/inbound",
  requireIntegrationKey,
  async (req, res): Promise<void> => {
    try {
      const result = await ingestExternalOrder(req.body ?? {});
      res.status(result.existingOrderId ? 200 : 201).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao receber pedido externo.";
      req.log.error({ error }, "Falha na ingestão de pedido externo");
      res.status(400).json({ error: message });
    }
  },
);

function buildDevIfoodOrder(input: {
  externalOrderId: string;
  merchantId: string;
  eventType?: string;
  prepaid: boolean;
  deliveredBy?: "merchant" | "platform";
}) {
  return {
    source: "ifood",
    eventId: `evt-${input.externalOrderId}`,
    eventType: input.eventType ?? "confirmed",
    order: {
      id: input.externalOrderId,
      merchantId: input.merchantId,
      status: input.eventType ?? "confirmed",
      orderType: "delivery",
      customer: {
        name: "Cliente Dev iFood",
        phone: "11999999999",
        document: "00000000000",
      },
      delivery: {
        cep: "01001000",
        address: "Praça da Sé",
        number: "100",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
        reference: "Pedido simulado iFood-ready",
        fee: 7.5,
        distanceKm: 3.2,
        deliveredBy: input.deliveredBy ?? "merchant",
      },
      payments: {
        status: input.prepaid ? "paid" : "pending",
        prepaid: input.prepaid,
        totalAmount: 57.5,
        methods: [
          input.prepaid
            ? {
                id: `pay-${input.externalOrderId}`,
                method: "ifood_online",
                status: "paid",
                value: 57.5,
              }
            : {
                id: `pay-${input.externalOrderId}`,
                method: "cash",
                status: "pending",
                value: 57.5,
                changeFor: 100,
              },
        ],
      },
      items: [
        {
          id: `item-${input.externalOrderId}-1`,
          name: "Pizza Dev Calabresa",
          quantity: 1,
          unitPrice: 45,
          totalPrice: 45,
          notes: "Sem cebola",
          options: [
            {
              id: `addon-${input.externalOrderId}-1`,
              groupName: "Borda",
              name: "Catupiry",
              quantity: 1,
              unitPrice: 5,
              totalPrice: 5,
            },
          ],
        },
      ],
      notes: "Payload dev sem credenciais reais do iFood.",
    },
    merchant: {
      id: input.merchantId,
      name: "Loja Dev iFood",
    },
  };
}

async function ensureDevIfoodMapping(req: Parameters<typeof getCurrentActor>[0]) {
  const actor = await getCurrentActor(req);
  const merchantId = `dev-ifood-store-${actor.storeId}`;
  await upsertExternalStoreIntegration({
    storeId: actor.storeId,
    source: "ifood",
    externalMerchantId: merchantId,
    externalMerchantName: `Loja ${actor.storeId} — Dev iFood`,
  });
  return merchantId;
}

router.post(
  "/integrations/dev/ifood-order/paid",
  requireAdminKey,
  async (req, res): Promise<void> => {
    const merchantId = await ensureDevIfoodMapping(req);
    const result = await ingestExternalOrder(
      buildDevIfoodOrder({
        externalOrderId: `dev-ifood-paid-${Date.now()}`,
        merchantId,
        prepaid: true,
      }),
    );
    res.status(201).json(result);
  },
);

router.post(
  "/integrations/dev/ifood-order/on-delivery",
  requireAdminKey,
  async (req, res): Promise<void> => {
    const merchantId = await ensureDevIfoodMapping(req);
    const result = await ingestExternalOrder(
      buildDevIfoodOrder({
        externalOrderId: `dev-ifood-on-delivery-${Date.now()}`,
        merchantId,
        prepaid: false,
      }),
    );
    res.status(201).json(result);
  },
);

router.post(
  "/integrations/dev/ifood-order/cancelled",
  requireAdminKey,
  async (req, res): Promise<void> => {
    const merchantId = await ensureDevIfoodMapping(req);
    const externalOrderId = `dev-ifood-cancelled-${Date.now()}`;
    const created = await ingestExternalOrder(
      buildDevIfoodOrder({ externalOrderId, merchantId, prepaid: false }),
    );
    const cancelled = await ingestExternalOrder(
      buildDevIfoodOrder({
        externalOrderId,
        merchantId,
        prepaid: false,
        eventType: "cancelled",
      }),
    );
    res.status(201).json({ created, cancelled });
  },
);

router.post(
  "/integrations/dev/ifood-order/duplicate",
  requireAdminKey,
  async (req, res): Promise<void> => {
    const merchantId = await ensureDevIfoodMapping(req);
    const externalOrderId = `dev-ifood-duplicate-${Date.now()}`;
    const payload = buildDevIfoodOrder({ externalOrderId, merchantId, prepaid: true });
    const first = await ingestExternalOrder(payload);
    const second = await ingestExternalOrder(payload);
    res.status(201).json({ first, second });
  },
);

export default router;
