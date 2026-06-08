import { and, eq } from "drizzle-orm";
import { db, deliveryDistanceCacheTable, type StoreSettings } from "@workspace/db";
import { calculateDeliveryFee, estimateDistanceKmFromCep, normalizeCep } from "./delivery-fee";
import {
  calculateRouteDistanceKm,
  getOrsApiKey,
  isOrsConfigured,
} from "./openrouteservice";
import {
  getStoreDeliveryOrigin,
  INVALID_STORE_CEP_DELIVERY_ERROR,
  type StoreDeliveryOrigin,
} from "./store-delivery-origin";

export const INVALID_CUSTOMER_CEP_DELIVERY_ERROR = "CEP do cliente inválido.";

export type DeliveryDistanceResult = {
  estimatedDistanceKm: number;
  distanceKm: number;
  source: "openrouteservice" | "approximate_cep";
  cached: boolean;
  fallback?: true;
  deliveryFee: number | null;
  deliveryFeeCalculated: boolean;
  origin: StoreDeliveryOrigin;
  customerCep: string;
};

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function settingsForFee(settings: StoreSettings) {
  return {
    deliveryFeeMode: settings.deliveryFeeMode,
    deliveryPricePerKm: numberOrNull(settings.deliveryPricePerKm),
    baseDeliveryDistanceKm: numberOrNull(settings.baseDeliveryDistanceKm),
    baseDeliveryFee: numberOrNull(settings.baseDeliveryFee),
    additionalPricePerKm: numberOrNull(settings.additionalPricePerKm),
    minimumDeliveryFee: numberOrNull(settings.minimumDeliveryFee),
    maximumDeliveryFee: numberOrNull(settings.maximumDeliveryFee),
  };
}

export async function calculateDeliveryDistanceForStore(input: {
  storeId: number;
  customerCep: string;
  customerAddress?: string | null;
  customerCity?: string | null;
}): Promise<DeliveryDistanceResult> {
  const origin = await getStoreDeliveryOrigin(input.storeId);
  const normCustomer = normalizeCep(String(input.customerCep ?? ""));
  if (!normCustomer) throw new Error(INVALID_CUSTOMER_CEP_DELIVERY_ERROR);

  const settings = origin.settings;
  const providerPref = settings.distanceProvider ?? "approximate_cep";
  const useCache = settings.useDistanceCache !== "false";
  const orsReady = providerPref === "openrouteservice" && isOrsConfigured();
  const activeProvider = orsReady ? "openrouteservice" : "approximate_cep";

  if (useCache) {
    const [cached] = await db
      .select()
      .from(deliveryDistanceCacheTable)
      .where(
        and(
          eq(deliveryDistanceCacheTable.originCep, origin.storeCep),
          eq(deliveryDistanceCacheTable.destinationCep, normCustomer),
          eq(deliveryDistanceCacheTable.provider, activeProvider),
        ),
      )
      .limit(1);

    if (cached) {
      const distanceKm = Number.parseFloat(String(cached.distanceKm));
      const feeMode = settings.deliveryFeeMode ?? "manual";
      const deliveryFeeCalculated = feeMode !== "manual";
      const deliveryFee = deliveryFeeCalculated
        ? calculateDeliveryFee(distanceKm, settingsForFee(settings))
        : null;
      return {
        estimatedDistanceKm: distanceKm,
        distanceKm,
        source: activeProvider,
        cached: true,
        deliveryFee,
        deliveryFeeCalculated,
        origin,
        customerCep: normCustomer,
      };
    }
  }

  let distanceKm: number | null = null;
  let source: "openrouteservice" | "approximate_cep" = activeProvider;
  let fallback = false;

  if (orsReady) {
    const customerFullAddr = [input.customerAddress, input.customerCity]
      .map((part) => (part ? String(part).trim() : ""))
      .filter(Boolean)
      .join(", ");

    if (origin.address.fullAddress && customerFullAddr) {
      distanceKm = await calculateRouteDistanceKm(
        origin.address.fullAddress,
        customerFullAddr,
        getOrsApiKey()!,
      );
    }

    if (distanceKm === null) {
      source = "approximate_cep";
      fallback = true;
    }
  }

  if (distanceKm === null) {
    distanceKm = estimateDistanceKmFromCep(origin.storeCep, normCustomer);
    source = "approximate_cep";
  }

  if (distanceKm === null) {
    throw new Error("Não foi possível calcular a distância.");
  }

  if (useCache) {
    await db
      .insert(deliveryDistanceCacheTable)
      .values({
        originCep: origin.storeCep,
        destinationCep: normCustomer,
        distanceKm: String(distanceKm),
        provider: source,
      })
      .onConflictDoNothing();
  }

  const feeMode = settings.deliveryFeeMode ?? "manual";
  const deliveryFeeCalculated = feeMode !== "manual";
  const deliveryFee = deliveryFeeCalculated
    ? calculateDeliveryFee(distanceKm, settingsForFee(settings))
    : null;

  return {
    estimatedDistanceKm: distanceKm,
    distanceKm,
    source,
    cached: false,
    ...(fallback ? { fallback: true as const } : {}),
    deliveryFee,
    deliveryFeeCalculated,
    origin,
    customerCep: normCustomer,
  };
}

export function deliveryCalculationErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message === INVALID_STORE_CEP_DELIVERY_ERROR ||
    message === INVALID_CUSTOMER_CEP_DELIVERY_ERROR
  ) {
    return 400;
  }
  return 422;
}
