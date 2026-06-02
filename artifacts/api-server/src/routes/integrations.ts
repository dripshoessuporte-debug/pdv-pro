import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  storeSettingsTable,
  deliveryDistanceCacheTable,
} from "@workspace/db";
import {
  estimateDistanceKmFromCep,
  calculateDeliveryFee,
  normalizeCep,
} from "../lib/delivery-fee";
import {
  calculateRouteDistanceKm,
  isOrsConfigured,
  getOrsApiKey,
} from "../lib/openrouteservice";
import { getOrCreateSettings } from "./settings";
import { requireIntegrationKey } from "../middleware/security";
import { getDefaultStoreIdOrThrow } from "../lib/store-context";

const router: IRouter = Router();

/**
 * POST /integrations/orders/inbound
 *
 * Receives an external order from iFood, WhatsApp, site, totem, etc.
 * Protected by x-integration-key header when INTEGRATION_API_KEY env var is set.
 */
router.post(
  "/integrations/orders/inbound",
  requireIntegrationKey,
  async (req, res): Promise<void> => {
    const storeId = await getDefaultStoreIdOrThrow();

    const body = req.body ?? {};

    // --- Basic validation ---
    const {
      source,
      externalOrderId,
      type,
      customer,
      delivery,
      payment,
      items,
      notes,
    } = body;

    if (!source || typeof source !== "string") {
      res
        .status(400)
        .json({
          error:
            "Campo 'source' é obrigatório (ifood, whatsapp, site, totem, garcom, api_externa).",
        });
      return;
    }

    const validSources = [
      "ifood",
      "whatsapp",
      "site",
      "totem",
      "garcom",
      "api_externa",
    ];
    if (!validSources.includes(source)) {
      res
        .status(400)
        .json({ error: `source inválido. Use: ${validSources.join(", ")}.` });
      return;
    }

    const validTypes = ["delivery", "takeaway", "counter", "table"];
    const orderType = type ?? "delivery";
    if (!validTypes.includes(orderType)) {
      res
        .status(400)
        .json({ error: `type inválido. Use: ${validTypes.join(", ")}.` });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res
        .status(400)
        .json({
          error: "Campo 'items' é obrigatório e deve conter ao menos um item.",
        });
      return;
    }

    for (const item of items) {
      if (!item.name || typeof item.name !== "string") {
        res.status(400).json({ error: "Cada item deve ter 'name' (string)." });
        return;
      }
      if (typeof item.unitPrice !== "number" || item.unitPrice < 0) {
        res
          .status(400)
          .json({ error: "Cada item deve ter 'unitPrice' (number >= 0)." });
        return;
      }
      if (typeof item.quantity !== "number" || item.quantity < 1) {
        res
          .status(400)
          .json({ error: "Cada item deve ter 'quantity' (integer >= 1)." });
        return;
      }
    }

    // --- Duplicate check (source + externalOrderId) ---
    if (externalOrderId) {
      const [existing] = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.source, source),
            eq(ordersTable.externalOrderId, String(externalOrderId)),
          ),
        )
        .limit(1);

      if (existing) {
        res.status(409).json({
          error:
            "Pedido duplicado: já existe um pedido com esse source + externalOrderId.",
          existingOrderId: existing.id,
        });
        return;
      }
    }

    // --- Delivery fee calculation ---
    const settings = await getOrCreateSettings();

    let resolvedDeliveryFee = 0;
    let deliveryFeeSource = "manual";
    let estimatedDistanceKm: number | null = null;
    let deliveryFeeCalculated = false;
    let deliveryDistanceSource: string | null = null;

    if (orderType === "delivery") {
      const providedFee = delivery?.fee;

      if (typeof providedFee === "number" && providedFee >= 0) {
        // External API sent the fee — preserve it as-is
        resolvedDeliveryFee = providedFee;
        deliveryFeeSource = "external_api";
        deliveryDistanceSource = "external_api";
        estimatedDistanceKm =
          typeof delivery?.distanceKm === "number" ? delivery.distanceKm : null;
      } else if (
        (settings.deliveryFeeMode === "per_km" ||
          settings.deliveryFeeMode === "distance_tier") &&
        delivery?.cep &&
        settings.storeCep
      ) {
        // Calculate distance — try ORS first, fall back to CEP estimation
        const normStore = normalizeCep(settings.storeCep);
        const normCustomer = normalizeCep(String(delivery.cep));
        const providerPref = settings.distanceProvider ?? "approximate_cep";
        const useCache = settings.useDistanceCache !== "false";
        const orsReady =
          providerPref === "openrouteservice" && isOrsConfigured();
        const activeProvider = orsReady
          ? "openrouteservice"
          : "approximate_cep";

        let dist: number | null = null;

        // Check cache first
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
            dist = parseFloat(String(cached.distanceKm));
            deliveryDistanceSource = activeProvider;
          }
        }

        // ORS calculation
        if (dist === null && orsReady) {
          const apiKey = getOrsApiKey()!;
          const storeAddr = [
            settings.storeAddress,
            settings.storeNumber,
            settings.storeNeighborhood,
            settings.storeCity,
            settings.storeState,
            settings.storeCountry,
          ]
            .filter(Boolean)
            .join(", ");
          const customerLocality = [delivery.city, delivery.state]
            .filter(Boolean)
            .join(", ");
          const fallbackLocality = [settings.storeCity, settings.storeState]
            .filter(Boolean)
            .join(", ");
          // Fallback local only when customer city/state are missing.
          const custAddr = [
            delivery.address,
            customerLocality || fallbackLocality,
            delivery.country ?? settings.storeCountry,
          ]
            .filter(Boolean)
            .join(", ");
          if (storeAddr && custAddr) {
            dist = await calculateRouteDistanceKm(storeAddr, custAddr, apiKey);
            if (dist !== null) {
              deliveryDistanceSource = "openrouteservice";
              if (useCache && normStore && normCustomer) {
                await db
                  .insert(deliveryDistanceCacheTable)
                  .values({
                    originCep: normStore,
                    destinationCep: normCustomer,
                    distanceKm: String(dist),
                    provider: "openrouteservice",
                  })
                  .onConflictDoNothing();
              }
            }
          }
        }

        // CEP fallback
        if (dist === null && normStore && normCustomer) {
          dist = estimateDistanceKmFromCep(normStore, normCustomer);
          if (dist !== null) {
            deliveryDistanceSource = "approximate_cep";
            if (useCache) {
              await db
                .insert(deliveryDistanceCacheTable)
                .values({
                  originCep: normStore!,
                  destinationCep: normCustomer!,
                  distanceKm: String(dist),
                  provider: "approximate_cep",
                })
                .onConflictDoNothing();
            }
          }
        }

        if (dist !== null) {
          estimatedDistanceKm = dist;
          resolvedDeliveryFee = calculateDeliveryFee(dist, {
            deliveryFeeMode: settings.deliveryFeeMode,
            deliveryPricePerKm: settings.deliveryPricePerKm
              ? parseFloat(String(settings.deliveryPricePerKm))
              : null,
            baseDeliveryDistanceKm: settings.baseDeliveryDistanceKm
              ? parseFloat(String(settings.baseDeliveryDistanceKm))
              : null,
            baseDeliveryFee: settings.baseDeliveryFee
              ? parseFloat(String(settings.baseDeliveryFee))
              : null,
            additionalPricePerKm: settings.additionalPricePerKm
              ? parseFloat(String(settings.additionalPricePerKm))
              : null,
            minimumDeliveryFee: settings.minimumDeliveryFee
              ? parseFloat(String(settings.minimumDeliveryFee))
              : null,
            maximumDeliveryFee: settings.maximumDeliveryFee
              ? parseFloat(String(settings.maximumDeliveryFee))
              : null,
          });
          deliveryFeeSource = "automatic";
          deliveryFeeCalculated = true;
        }
      }
    }

    // --- Recalculate subtotal from items ---
    const subtotal = items.reduce(
      (sum: number, item: { unitPrice: number; quantity: number }) =>
        sum + item.unitPrice * item.quantity,
      0,
    );
    const totalAmount = subtotal + resolvedDeliveryFee;

    // --- Payment fields ---
    const paymentTiming =
      payment?.timing === "on_delivery" ? "on_delivery" : "now";
    const deliveryPaymentMethod = payment?.method ?? null;
    const changeFor =
      typeof payment?.changeFor === "number" ? String(payment.changeFor) : null;
    const deliveryPaymentNotes = payment?.notes ?? null;
    const needsChange = changeFor !== null ? "true" : "false";

    // --- Create order ---
    const [order] = await db
      .insert(ordersTable)
      .values({
        storeId,
        type: orderType,
        status: "open",
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        notes: notes ?? null,
        totalAmount: String(totalAmount),
        deliveryFee: String(resolvedDeliveryFee),
        // Delivery address
        deliveryCep: delivery?.cep ?? null,
        deliveryAddress: delivery?.address ?? null,
        deliveryNeighborhood: delivery?.neighborhood ?? null,
        deliveryReference: delivery?.reference ?? null,
        // Delivery status
        deliveryStatus: orderType === "delivery" ? "pending" : null,
        // Payment fields
        paymentTiming,
        deliveryPaymentMethod,
        needsChange,
        changeFor,
        deliveryPaymentNotes,
        // Integration fields
        source,
        externalOrderId: externalOrderId ? String(externalOrderId) : null,
        rawPayload: JSON.stringify(body),
        integrationStatus: "received",
        estimatedDistanceKm:
          estimatedDistanceKm !== null ? String(estimatedDistanceKm) : null,
        deliveryFeeCalculated: String(deliveryFeeCalculated),
        deliveryFeeSource,
        deliveryDistanceSource,
      })
      .returning();

    // --- Create order items ---
    for (const item of items) {
      const qty = Math.round(item.quantity);
      const unitP = item.unitPrice;
      const totalP = unitP * qty;

      await db.insert(orderItemsTable).values({
        orderId: order.id,
        productId: null,
        externalProductName: item.name,
        quantity: qty,
        unitPrice: String(unitP),
        totalPrice: String(totalP),
        notes: item.notes ?? null,
      });
    }

    req.log.info(
      { orderId: order.id, source, externalOrderId },
      "Pedido externo recebido",
    );

    res.status(201).json({
      id: order.id,
      source,
      externalOrderId: order.externalOrderId,
      integrationStatus: order.integrationStatus,
      totalAmount,
      deliveryFeeSource,
      estimatedDistanceKm,
      message: "Pedido criado com sucesso.",
    });
  },
);

export default router;
