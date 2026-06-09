import { and, eq } from "drizzle-orm";
import {
  db,
  deliveryDistanceCacheTable,
  externalOrderEventsTable,
  externalStoreIntegrationsTable,
  kitchenTicketsTable,
  orderItemAddonsTable,
  orderItemsTable,
  ordersTable,
  paymentsTable,
  storeSettingsTable,
} from "@workspace/db";
import {
  calculateDeliveryFee,
  estimateDistanceKmFromCep,
  normalizeCep,
} from "./delivery-fee";
import {
  calculateRouteDistanceKm,
  getOrsApiKey,
  isOrsConfigured,
} from "./openrouteservice";

const VALID_SOURCES = [
  "ifood",
  "whatsapp",
  "site",
  "totem",
  "garcom",
  "api_externa",
] as const;

const PLATFORM_PAYMENT_METHODS = ["ifood_online", "platform"] as const;

type ExternalSource = (typeof VALID_SOURCES)[number];
type OrderType = "delivery" | "takeaway" | "counter";
type DeliveryOwner = "merchant" | "platform" | "unknown";
type ExternalPaymentMethod =
  | "cash"
  | "pix"
  | "credit_card"
  | "debit_card"
  | "voucher"
  | "ifood_online"
  | "platform"
  | "unknown";
type ExternalPaymentStatus =
  | "paid"
  | "pending"
  | "partially_paid"
  | "cancelled"
  | "unknown";
type ExternalPaymentTiming = "now" | "on_delivery";
type ExternalEventType =
  | "placed"
  | "created"
  | "confirmed"
  | "accepted"
  | "preparing"
  | "ready"
  | "dispatched"
  | "delivered"
  | "cancelled"
  | "failed";

type NormalizedAddon = {
  externalAddonId?: string | null;
  groupName?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number | null;
};

type NormalizedItem = {
  externalItemId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number | null;
  notes?: string | null;
  options?: NormalizedAddon[];
};

export type NormalizedExternalOrder = {
  source: ExternalSource;
  externalEventId?: string | null;
  externalOrderId: string;
  externalMerchantId: string;
  storeId?: number;
  eventType: ExternalEventType;
  type: OrderType;
  customer: {
    name?: string | null;
    phone?: string | null;
    document?: string | null;
  };
  delivery: {
    cep?: string | null;
    address?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    complement?: string | null;
    reference?: string | null;
    fee?: number | null;
    distanceKm?: number | null;
    deliveredBy: DeliveryOwner;
  };
  payment: {
    status: ExternalPaymentStatus;
    timing: ExternalPaymentTiming;
    method: ExternalPaymentMethod;
    prepaid: boolean;
    changeFor?: number | null;
    amount?: number | null;
    externalPaymentId?: string | null;
  };
  items: NormalizedItem[];
  notes?: string | null;
  rawPayload: unknown;
};

type IngestionResult = {
  id?: number;
  existingOrderId?: number;
  eventId: number;
  source: ExternalSource;
  externalOrderId: string;
  integrationStatus: string | null;
  totalAmount?: number;
  paymentRegistered?: boolean;
  kitchenTicketCreated?: boolean;
  message: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSource(value: unknown): ExternalSource {
  const source = asString(value);
  if (!source || !VALID_SOURCES.includes(source as ExternalSource)) {
    throw new Error(
      `source inválido. Use: ${VALID_SOURCES.join(", ")}.`,
    );
  }
  return source as ExternalSource;
}

function normalizeOrderType(value: unknown): OrderType {
  const type = asString(value);
  if (type === "delivery" || type === "takeaway" || type === "counter") {
    return type;
  }
  if (type === "table") return "counter";
  return "delivery";
}

function normalizeDeliveryOwner(value: unknown): DeliveryOwner {
  const owner = asString(value);
  if (owner === "merchant" || owner === "platform") return owner;
  return "unknown";
}

function normalizePaymentMethod(value: unknown): ExternalPaymentMethod {
  const method = asString(value);
  if (
    method === "cash" ||
    method === "pix" ||
    method === "credit_card" ||
    method === "debit_card" ||
    method === "voucher" ||
    method === "ifood_online" ||
    method === "platform"
  ) {
    return method;
  }
  return "unknown";
}

function normalizePaymentStatus(value: unknown): ExternalPaymentStatus {
  const status = asString(value);
  if (
    status === "paid" ||
    status === "pending" ||
    status === "partially_paid" ||
    status === "cancelled" ||
    status === "unknown"
  ) {
    return status;
  }
  return "unknown";
}

function normalizeEventType(value: unknown): ExternalEventType {
  const eventType = asString(value);
  if (
    eventType === "placed" ||
    eventType === "created" ||
    eventType === "confirmed" ||
    eventType === "accepted" ||
    eventType === "preparing" ||
    eventType === "ready" ||
    eventType === "dispatched" ||
    eventType === "delivered" ||
    eventType === "cancelled" ||
    eventType === "failed"
  ) {
    return eventType;
  }
  return "created";
}

function isConfirmedEvent(eventType: ExternalEventType): boolean {
  return ["confirmed", "accepted", "preparing"].includes(eventType);
}

function isPlatformPaymentMethod(method: string | null | undefined): boolean {
  return PLATFORM_PAYMENT_METHODS.includes(
    method as (typeof PLATFORM_PAYMENT_METHODS)[number],
  );
}

function validateNormalizedOrder(order: NormalizedExternalOrder): void {
  if (!order.externalOrderId) throw new Error("externalOrderId é obrigatório.");
  if (!order.externalMerchantId) {
    throw new Error("externalMerchantId/merchantId é obrigatório.");
  }
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error("items é obrigatório e deve conter ao menos um item.");
  }
  for (const item of order.items) {
    if (!item.name) throw new Error("Cada item deve ter name.");
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      throw new Error("Cada item deve ter unitPrice >= 0.");
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error("Cada item deve ter quantity > 0.");
    }
  }
}

function normalizeAddons(value: unknown): NormalizedAddon[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): NormalizedAddon | null => {
      const addon = asRecord(raw);
      const name = asString(addon.name ?? addon.addonName ?? addon.optionName);
      if (!name) return null;
      const quantity = Math.max(1, Math.round(asNumber(addon.quantity) ?? 1));
      const unitPrice = asNumber(addon.unitPrice ?? addon.price) ?? 0;
      return {
        externalAddonId: asString(addon.externalAddonId ?? addon.id),
        groupName: asString(addon.groupName ?? addon.addonGroupName) ?? "Adicionais",
        name,
        quantity,
        unitPrice,
        totalPrice: asNumber(addon.totalPrice) ?? unitPrice * quantity,
      };
    })
    .filter((addon): addon is NormalizedAddon => addon !== null);
}

export function normalizeGenericInboundOrder(body: unknown): NormalizedExternalOrder {
  const input = asRecord(body);
  const delivery = asRecord(input.delivery);
  const customer = asRecord(input.customer);
  const payment = asRecord(input.payment);
  const items = Array.isArray(input.items) ? input.items : [];
  const method = normalizePaymentMethod(payment.method);
  const status = normalizePaymentStatus(payment.status);
  const timing =
    payment.timing === "on_delivery" || (!payment.prepaid && status !== "paid")
      ? "on_delivery"
      : "now";

  return {
    source: normalizeSource(input.source),
    externalEventId: asString(input.externalEventId ?? input.eventId),
    externalOrderId: asString(input.externalOrderId ?? input.orderId) ?? "",
    externalMerchantId:
      asString(input.externalMerchantId ?? input.merchantId) ?? "",
    eventType: normalizeEventType(input.eventType ?? input.status),
    type: normalizeOrderType(input.type),
    customer: {
      name: asString(customer.name),
      phone: asString(customer.phone),
      document: asString(customer.document),
    },
    delivery: {
      cep: asString(delivery.cep),
      address: asString(delivery.address),
      number: asString(delivery.number),
      neighborhood: asString(delivery.neighborhood),
      city: asString(delivery.city),
      state: asString(delivery.state),
      complement: asString(delivery.complement),
      reference: asString(delivery.reference),
      fee: asNumber(delivery.fee),
      distanceKm: asNumber(delivery.distanceKm),
      deliveredBy: normalizeDeliveryOwner(delivery.deliveredBy),
    },
    payment: {
      status,
      timing,
      method,
      prepaid: Boolean(payment.prepaid ?? status === "paid"),
      changeFor: asNumber(payment.changeFor),
      amount: asNumber(payment.amount),
      externalPaymentId: asString(payment.externalPaymentId ?? payment.id),
    },
    items: items.map((raw) => {
      const item = asRecord(raw);
      return {
        externalItemId: asString(item.externalItemId ?? item.id),
        name: asString(item.name) ?? "Item externo",
        quantity: Math.max(1, Math.round(asNumber(item.quantity) ?? 1)),
        unitPrice: asNumber(item.unitPrice ?? item.price) ?? 0,
        totalPrice: asNumber(item.totalPrice),
        notes: asString(item.notes),
        options: normalizeAddons(item.options ?? item.addons ?? item.modifiers),
      };
    }),
    notes: asString(input.notes),
    rawPayload: body,
  };
}

export function normalizeIfoodOrder(rawIfoodOrder: unknown): NormalizedExternalOrder {
  const raw = asRecord(rawIfoodOrder);
  const order = asRecord(raw.order ?? raw);
  const merchant = asRecord(order.merchant ?? raw.merchant);
  const customer = asRecord(order.customer);
  const delivery = asRecord(order.delivery);
  const payments = asRecord(order.payments ?? order.payment);
  const paymentList = Array.isArray(payments.methods)
    ? payments.methods
    : Array.isArray(order.payments)
      ? order.payments
      : [];
  const firstPayment = asRecord(paymentList[0] ?? payments);
  const paymentStatus = normalizePaymentStatus(
    payments.status ?? firstPayment.status ?? (payments.prepaid ? "paid" : undefined),
  );
  const prepaid = Boolean(
    payments.prepaid ?? firstPayment.prepaid ?? paymentStatus === "paid",
  );
  const method = prepaid
    ? "ifood_online"
    : normalizePaymentMethod(firstPayment.method ?? firstPayment.type);

  // TODO(ifood-docs): ajustar extração de IDs/status/fulfillment conforme a
  // documentação oficial final e as credenciais homologadas do iFood estiverem
  // disponíveis. Nenhuma credencial real é usada neste normalizador.
  const eventType = normalizeEventType(
    raw.eventType ?? raw.fullCode ?? raw.code ?? order.status,
  );
  const deliveredByRaw =
    delivery.deliveredBy ?? delivery.deliveryBy ?? delivery.mode ?? delivery.type;
  const deliveredBy =
    String(deliveredByRaw ?? "").toLowerCase().includes("ifood") ||
    String(deliveredByRaw ?? "").toLowerCase().includes("platform")
      ? "platform"
      : normalizeDeliveryOwner(deliveredByRaw);

  const normalized = normalizeGenericInboundOrder({
    source: "ifood",
    externalEventId: raw.eventId ?? raw.id,
    externalOrderId: order.id ?? raw.orderId,
    externalMerchantId: merchant.id ?? raw.merchantId ?? order.merchantId,
    eventType,
    type: order.orderType ?? (delivery ? "delivery" : "takeaway"),
    customer: {
      name: customer.name,
      phone: customer.phone ?? customer.localizer,
      document: customer.documentNumber ?? customer.document,
    },
    delivery: {
      cep: delivery.postalCode ?? delivery.cep,
      address: delivery.streetName ?? delivery.address,
      number: delivery.streetNumber ?? delivery.number,
      neighborhood: delivery.neighborhood,
      city: delivery.city,
      state: delivery.state,
      complement: delivery.complement,
      reference: delivery.reference,
      fee: delivery.deliveryFee ?? delivery.fee,
      distanceKm: delivery.distanceKm,
      deliveredBy,
    },
    payment: {
      status: paymentStatus,
      timing: prepaid ? "now" : "on_delivery",
      method,
      prepaid,
      amount: payments.totalAmount ?? firstPayment.value ?? order.totalAmount,
      externalPaymentId: firstPayment.id ?? payments.id,
      changeFor: firstPayment.changeFor,
    },
    items: Array.isArray(order.items) ? order.items : [],
    notes: order.observations ?? order.notes,
  });
  normalized.rawPayload = rawIfoodOrder;
  return normalized;
}

export function normalizeExternalOrder(body: unknown): NormalizedExternalOrder {
  const input = asRecord(body);
  const source = normalizeSource(input.source ?? (input.merchantId ? "ifood" : undefined));
  const normalized =
    source === "ifood" ? normalizeIfoodOrder({ ...input, source }) : normalizeGenericInboundOrder(input);
  validateNormalizedOrder(normalized);
  return normalized;
}

export async function resolveExternalStoreId(
  source: string,
  externalMerchantId: string,
): Promise<number> {
  const [mapping] = await db
    .select({ storeId: externalStoreIntegrationsTable.storeId })
    .from(externalStoreIntegrationsTable)
    .where(
      and(
        eq(externalStoreIntegrationsTable.source, source),
        eq(externalStoreIntegrationsTable.externalMerchantId, externalMerchantId),
        eq(externalStoreIntegrationsTable.enabled, true),
      ),
    )
    .limit(1);

  if (!mapping) {
    throw new Error(
      `Nenhum mapeamento ativo encontrado para source=${source} merchantId=${externalMerchantId}.`,
    );
  }

  return mapping.storeId;
}

async function getOrCreateSettingsForStore(storeId: number) {
  const [existing] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.storeId, storeId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(storeSettingsTable).values({ storeId }).returning();
  return created!;
}

async function resolveDeliveryPricing(order: NormalizedExternalOrder): Promise<{
  fee: number;
  feeSource: string;
  distanceKm: number | null;
  feeCalculated: boolean;
  distanceSource: string | null;
}> {
  if (order.type !== "delivery") {
    return { fee: 0, feeSource: "manual", distanceKm: null, feeCalculated: false, distanceSource: null };
  }

  if (typeof order.delivery.fee === "number" && order.delivery.fee >= 0) {
    return {
      fee: order.delivery.fee,
      feeSource: "external_api",
      distanceKm: order.delivery.distanceKm ?? null,
      feeCalculated: false,
      distanceSource: order.delivery.distanceKm != null ? "external_api" : null,
    };
  }

  if (order.delivery.deliveredBy === "platform") {
    return { fee: 0, feeSource: "external_api", distanceKm: order.delivery.distanceKm ?? null, feeCalculated: false, distanceSource: order.delivery.distanceKm != null ? "external_api" : null };
  }

  const settings = await getOrCreateSettingsForStore(order.storeId!);
  let distanceKm: number | null = order.delivery.distanceKm ?? null;
  let distanceSource: string | null = distanceKm != null ? "external_api" : null;

  if (
    distanceKm === null &&
    (settings.deliveryFeeMode === "per_km" || settings.deliveryFeeMode === "distance_tier") &&
    order.delivery.cep &&
    settings.storeCep
  ) {
    const normStore = normalizeCep(settings.storeCep);
    const normCustomer = normalizeCep(order.delivery.cep);
    const providerPref = settings.distanceProvider ?? "approximate_cep";
    const useCache = settings.useDistanceCache !== "false";
    const orsReady = providerPref === "openrouteservice" && isOrsConfigured();
    const activeProvider = orsReady ? "openrouteservice" : "approximate_cep";

    if (useCache && normStore && normCustomer) {
      const [cached] = await db
        .select()
        .from(deliveryDistanceCacheTable)
        .where(
          and(
            eq(deliveryDistanceCacheTable.originCep, normStore),
            eq(deliveryDistanceCacheTable.destinationCep, normCustomer),
            eq(deliveryDistanceCacheTable.provider, activeProvider),
          ),
        )
        .limit(1);
      if (cached) {
        distanceKm = parseFloat(String(cached.distanceKm));
        distanceSource = activeProvider;
      }
    }

    if (distanceKm === null && orsReady) {
      const apiKey = getOrsApiKey()!;
      const storeAddr = [
        settings.storeAddress,
        settings.storeNumber,
        settings.storeNeighborhood,
        settings.storeCity,
        settings.storeState,
        settings.storeCountry,
      ].filter(Boolean).join(", ");
      const customerLocality = [order.delivery.city, order.delivery.state].filter(Boolean).join(", ");
      const fallbackLocality = [settings.storeCity, settings.storeState].filter(Boolean).join(", ");
      const customerAddr = [
        order.delivery.address,
        customerLocality || fallbackLocality,
        settings.storeCountry,
      ].filter(Boolean).join(", ");
      if (storeAddr && customerAddr) {
        distanceKm = await calculateRouteDistanceKm(storeAddr, customerAddr, apiKey);
        if (distanceKm !== null) {
          distanceSource = "openrouteservice";
          if (useCache && normStore && normCustomer) {
            await db.insert(deliveryDistanceCacheTable).values({
              originCep: normStore,
              destinationCep: normCustomer,
              distanceKm: String(distanceKm),
              provider: "openrouteservice",
            }).onConflictDoNothing();
          }
        }
      }
    }

    if (distanceKm === null && normStore && normCustomer) {
      distanceKm = estimateDistanceKmFromCep(normStore, normCustomer);
      if (distanceKm !== null) {
        distanceSource = "approximate_cep";
        if (useCache) {
          await db.insert(deliveryDistanceCacheTable).values({
            originCep: normStore,
            destinationCep: normCustomer,
            distanceKm: String(distanceKm),
            provider: "approximate_cep",
          }).onConflictDoNothing();
        }
      }
    }
  }

  if (distanceKm !== null) {
    return {
      fee: calculateDeliveryFee(distanceKm, {
        deliveryFeeMode: settings.deliveryFeeMode,
        deliveryPricePerKm: settings.deliveryPricePerKm ? parseFloat(String(settings.deliveryPricePerKm)) : null,
        baseDeliveryDistanceKm: settings.baseDeliveryDistanceKm ? parseFloat(String(settings.baseDeliveryDistanceKm)) : null,
        baseDeliveryFee: settings.baseDeliveryFee ? parseFloat(String(settings.baseDeliveryFee)) : null,
        additionalPricePerKm: settings.additionalPricePerKm ? parseFloat(String(settings.additionalPricePerKm)) : null,
        minimumDeliveryFee: settings.minimumDeliveryFee ? parseFloat(String(settings.minimumDeliveryFee)) : null,
        maximumDeliveryFee: settings.maximumDeliveryFee ? parseFloat(String(settings.maximumDeliveryFee)) : null,
      }),
      feeSource: "automatic",
      distanceKm,
      feeCalculated: true,
      distanceSource,
    };
  }

  return { fee: 0, feeSource: "manual", distanceKm: null, feeCalculated: false, distanceSource };
}

export async function registerExternalOrderPayment(input: {
  orderId: number;
  storeId: number;
  amount: number;
  method: string;
  source: string;
  externalPaymentId?: string | null;
  paidAt: Date;
}) {
  if (!isPlatformPaymentMethod(input.method)) {
    throw new Error("registerExternalOrderPayment aceita apenas métodos de plataforma.");
  }

  const [existing] = await db
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .where(eq(paymentsTable.orderId, input.orderId))
    .limit(1);
  if (existing) return existing;

  const [payment] = await db.insert(paymentsTable).values({
    orderId: input.orderId,
    amount: String(input.amount),
    method: input.method,
    status: "approved",
    source: input.source,
    externalPaymentId: input.externalPaymentId ?? null,
    paidAt: input.paidAt,
  }).returning();

  await db.update(ordersTable).set({ paidAt: input.paidAt }).where(
    and(eq(ordersTable.id, input.orderId), eq(ordersTable.storeId, input.storeId)),
  );

  return payment!;
}

function buildOperationalState(order: NormalizedExternalOrder): {
  status: string;
  deliveryStatus: string | null;
  integrationStatus: string;
  sendToKitchen: boolean;
  kitchenAcceptedAt: Date | null;
} {
  if (order.eventType === "cancelled" || order.payment.status === "cancelled") {
    return { status: "cancelled", deliveryStatus: order.type === "delivery" ? "cancelled" : null, integrationStatus: "cancelled", sendToKitchen: false, kitchenAcceptedAt: null };
  }
  if (isConfirmedEvent(order.eventType)) {
    const deliveryStatus =
      order.type !== "delivery"
        ? null
        : order.delivery.deliveredBy === "platform"
          ? "platform_delivery"
          : "preparing";
    return { status: "preparing", deliveryStatus, integrationStatus: "processing", sendToKitchen: true, kitchenAcceptedAt: new Date() };
  }
  return { status: "open", deliveryStatus: order.type === "delivery" ? "pending" : null, integrationStatus: "received", sendToKitchen: false, kitchenAcceptedAt: null };
}

export async function ingestExternalOrder(body: unknown): Promise<IngestionResult> {
  const normalized = normalizeExternalOrder(body);
  const [event] = await db.insert(externalOrderEventsTable).values({
    source: normalized.source,
    externalEventId: normalized.externalEventId ?? null,
    externalOrderId: normalized.externalOrderId,
    externalMerchantId: normalized.externalMerchantId,
    eventType: normalized.eventType,
    rawPayload: JSON.stringify(normalized.rawPayload),
    processingStatus: "pending",
  }).returning();

  try {
    const storeId = await resolveExternalStoreId(normalized.source, normalized.externalMerchantId);
    normalized.storeId = storeId;
    await db.update(externalOrderEventsTable).set({ storeId, processingStatus: "processing" }).where(eq(externalOrderEventsTable.id, event!.id));

    const [existing] = await db.select({ id: ordersTable.id, status: ordersTable.status }).from(ordersTable).where(
      and(
        eq(ordersTable.storeId, storeId),
        eq(ordersTable.source, normalized.source),
        eq(ordersTable.externalOrderId, normalized.externalOrderId),
      ),
    ).limit(1);

    if (existing) {
      if (normalized.eventType === "cancelled") {
        await db.update(ordersTable).set({ status: "cancelled", deliveryStatus: "cancelled", integrationStatus: "cancelled" }).where(
          and(eq(ordersTable.id, existing.id), eq(ordersTable.storeId, storeId)),
        );
      }
      await db.update(externalOrderEventsTable).set({ processingStatus: "ignored", processedAt: new Date() }).where(eq(externalOrderEventsTable.id, event!.id));
      return { existingOrderId: existing.id, eventId: event!.id, source: normalized.source, externalOrderId: normalized.externalOrderId, integrationStatus: existing.status, message: "Pedido externo já existente; duplicidade ignorada." };
    }

    const pricing = await resolveDeliveryPricing(normalized);
    const subtotal = normalized.items.reduce((sum, item) => sum + (item.totalPrice ?? item.unitPrice * item.quantity), 0);
    const totalAmount = subtotal + pricing.fee;
    const state = buildOperationalState(normalized);

    const result = await db.transaction(async (tx) => {
      const [order] = await tx.insert(ordersTable).values({
        storeId,
        type: normalized.type,
        status: state.status,
        customerName: normalized.customer.name ?? null,
        customerPhone: normalized.customer.phone ?? null,
        notes: [normalized.notes, normalized.customer.document ? `Documento: ${normalized.customer.document}` : null]
          .filter(Boolean).join("\n") || null,
        totalAmount: String(totalAmount),
        deliveryFee: String(pricing.fee),
        deliveryCep: normalized.delivery.cep ?? null,
        deliveryAddress: [normalized.delivery.address, normalized.delivery.number]
          .filter(Boolean).join(", ") || null,
        deliveryNeighborhood: normalized.delivery.neighborhood ?? null,
        deliveryReference: [normalized.delivery.reference, normalized.delivery.complement]
          .filter(Boolean).join(" — ") || null,
        deliveryNotes: normalized.delivery.deliveredBy === "unknown" ? "Entrega externa sem deliveredBy confiável; conferir operação." : null,
        deliveryStatus: state.deliveryStatus,
        paymentTiming: normalized.payment.timing,
        deliveryPaymentMethod: normalized.payment.timing === "on_delivery" ? normalized.payment.method : null,
        needsChange: normalized.payment.changeFor != null ? "true" : "false",
        changeFor: normalized.payment.changeFor != null ? String(normalized.payment.changeFor) : null,
        deliveryPaymentNotes: normalized.payment.status === "unknown" ? "Pagamento externo com status desconhecido; conferir antes de fechar." : null,
        kitchenAcceptedAt: state.kitchenAcceptedAt,
        paidAt: normalized.payment.prepaid && normalized.payment.status === "paid" ? new Date() : null,
        source: normalized.source,
        externalOrderId: normalized.externalOrderId,
        rawPayload: JSON.stringify(normalized.rawPayload),
        integrationStatus: state.integrationStatus,
        estimatedDistanceKm: pricing.distanceKm !== null ? String(pricing.distanceKm) : null,
        deliveryFeeCalculated: String(pricing.feeCalculated),
        deliveryFeeSource: pricing.feeSource,
        deliveryDistanceSource: pricing.distanceSource,
      }).returning();

      for (const item of normalized.items) {
        const quantity = Math.max(1, Math.round(item.quantity));
        const itemTotal = item.totalPrice ?? item.unitPrice * quantity;
        const [orderItem] = await tx.insert(orderItemsTable).values({
          orderId: order!.id,
          productId: null,
          externalProductName: item.name,
          quantity,
          unitPrice: String(item.unitPrice),
          totalPrice: String(itemTotal),
          notes: [item.notes, item.externalItemId ? `externalItemId=${item.externalItemId}` : null]
            .filter(Boolean).join("\n") || null,
        }).returning();

        for (const addon of item.options ?? []) {
          await tx.insert(orderItemAddonsTable).values({
            orderItemId: orderItem!.id,
            addonOptionId: null,
            addonGroupName: addon.groupName ?? "Adicionais externos",
            addonName: addon.name,
            addonPrice: String(addon.unitPrice),
            quantity: addon.quantity,
            totalPrice: String(addon.totalPrice ?? addon.unitPrice * addon.quantity),
          });
        }
      }

      let paymentRegistered = false;
      if (
        normalized.payment.prepaid &&
        normalized.payment.status === "paid" &&
        isPlatformPaymentMethod(normalized.payment.method)
      ) {
        const paidAt = new Date();
        await tx.insert(paymentsTable).values({
          orderId: order!.id,
          amount: String(normalized.payment.amount ?? totalAmount),
          method: normalized.payment.method,
          status: "approved",
          source: normalized.source,
          externalPaymentId: normalized.payment.externalPaymentId ?? null,
          paidAt,
        });
        await tx.update(ordersTable).set({ paidAt }).where(eq(ordersTable.id, order!.id));
        paymentRegistered = true;
      }

      let kitchenTicketCreated = false;
      if (state.sendToKitchen) {
        await tx.insert(kitchenTicketsTable).values({ orderId: order!.id, status: "preparing" });
        kitchenTicketCreated = true;
      }

      await tx.update(externalOrderEventsTable).set({ processingStatus: "processed", processedAt: new Date() }).where(eq(externalOrderEventsTable.id, event!.id));

      return { order: order!, paymentRegistered, kitchenTicketCreated };
    });

    return {
      id: result.order.id,
      eventId: event!.id,
      source: normalized.source,
      externalOrderId: result.order.externalOrderId!,
      integrationStatus: result.order.integrationStatus,
      totalAmount,
      paymentRegistered: result.paymentRegistered,
      kitchenTicketCreated: result.kitchenTicketCreated,
      message: "Pedido externo criado com sucesso.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar pedido externo.";
    await db.update(externalOrderEventsTable).set({ processingStatus: "failed", errorMessage: message, processedAt: new Date() }).where(eq(externalOrderEventsTable.id, event!.id));
    throw error;
  }
}

export async function upsertExternalStoreIntegration(input: {
  storeId: number;
  source: ExternalSource;
  externalMerchantId: string;
  externalMerchantName?: string | null;
}) {
  const [created] = await db.insert(externalStoreIntegrationsTable).values({
    storeId: input.storeId,
    source: input.source,
    externalMerchantId: input.externalMerchantId,
    externalMerchantName: input.externalMerchantName ?? null,
    enabled: true,
  }).onConflictDoUpdate({
    target: [externalStoreIntegrationsTable.source, externalStoreIntegrationsTable.externalMerchantId],
    set: {
      storeId: input.storeId,
      externalMerchantName: input.externalMerchantName ?? null,
      enabled: true,
      updatedAt: new Date(),
    },
  }).returning();
  return created!;
}
