import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  deliveryDistanceCacheTable,
  type StoreSettings,
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
import {
  getStoreDeliveryOrigin,
  INVALID_STORE_CEP_DELIVERY_ERROR,
  type StoreDeliveryOrigin,
} from "./store-delivery-origin";

export const INVALID_CUSTOMER_CEP_DELIVERY_ERROR = "CEP do cliente inválido.";
export const INVALID_LOCAL_DELIVERY_DISTANCE_ERROR =
  "Distância calculada parece inválida para entrega local. Verifique CEP/endereço.";

export function maxAllowedDeliveryDistanceKm(): number {
  const configured = Number.parseFloat(
    process.env.MAX_ALLOWED_DELIVERY_DISTANCE_KM ?? "",
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 80;
}

export function isAllowedDeliveryDistanceKm(distanceKm: unknown): boolean {
  const parsed = Number.parseFloat(String(distanceKm ?? ""));
  return (
    Number.isFinite(parsed) &&
    parsed > 0 &&
    parsed <= maxAllowedDeliveryDistanceKm()
  );
}

function isInvalidLocalDeliveryDistanceKm(distanceKm: unknown): boolean {
  const parsed = Number.parseFloat(String(distanceKm ?? ""));
  return (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > maxAllowedDeliveryDistanceKm()
  );
}

export type DeliveryDistanceResult = {
  estimatedDistanceKm: number;
  distanceKm: number;
  source: "openrouteservice" | "approximate_cep";
  cached: boolean;
  fallback?: true;
  suspicious?: boolean;
  deliveryFee: number | null;
  deliveryFeeCalculated: boolean;
  feeSettings: ReturnType<typeof settingsForFee>;
  origin: StoreDeliveryOrigin;
  customerCep: string;
  customerAddressUsed: string | null;
  addressHash: string;
  distanceQuoteId: string;
};

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanAddressPart(value: unknown): string | null {
  const trimmed = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed || null;
}

function normalizeTextForKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hashAddress(value: string | null): string {
  if (!value) return "";
  return crypto
    .createHash("sha256")
    .update(normalizeTextForKey(value))
    .digest("hex")
    .slice(0, 24);
}

function buildQuoteId(parts: {
  storeCep: string;
  customerCep: string;
  provider: string;
  addressHash: string;
  distanceKm: number;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        parts.storeCep,
        parts.customerCep,
        parts.provider,
        parts.addressHash,
        parts.distanceKm.toFixed(3),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
}

function sameCity(
  settings: StoreSettings,
  customerCity?: string | null,
): boolean {
  const storeCity = normalizeTextForKey(settings.storeCity);
  const city = normalizeTextForKey(customerCity);
  return Boolean(storeCity && city && storeCity === city);
}

function isSuspiciousLocalDistance(input: {
  settings: StoreSettings;
  customerCity?: string | null;
  distanceKm: number;
}): boolean {
  return (
    sameCity(input.settings, input.customerCity) &&
    input.distanceKm > maxAllowedDeliveryDistanceKm()
  );
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
  ignoreCache?: boolean;
}): Promise<DeliveryDistanceResult> {
  const origin = await getStoreDeliveryOrigin(input.storeId);
  const normCustomer = normalizeCep(String(input.customerCep ?? ""));
  if (!normCustomer) throw new Error(INVALID_CUSTOMER_CEP_DELIVERY_ERROR);

  const settings = origin.settings;
  const providerPref = settings.distanceProvider ?? "approximate_cep";
  const useCache =
    settings.useDistanceCache !== "false" && input.ignoreCache !== true;
  const orsReady = providerPref === "openrouteservice" && isOrsConfigured();
  const activeProvider = orsReady ? "openrouteservice" : "approximate_cep";
  const customerFullAddr = [
    input.customerAddress,
    input.customerCity,
    normCustomer,
    "Brasil",
  ]
    .map(cleanAddressPart)
    .filter(Boolean)
    .join(", ");
  const customerAddressUsed = customerFullAddr || null;
  const addressHash =
    activeProvider === "openrouteservice"
      ? hashAddress(customerAddressUsed)
      : "";

  if (useCache) {
    const [cached] = await db
      .select()
      .from(deliveryDistanceCacheTable)
      .where(
        and(
          eq(deliveryDistanceCacheTable.originCep, origin.storeCep),
          eq(deliveryDistanceCacheTable.destinationCep, normCustomer),
          eq(deliveryDistanceCacheTable.provider, activeProvider),
          eq(deliveryDistanceCacheTable.addressHash, addressHash),
        ),
      )
      .limit(1);

    if (cached) {
      const distanceKm = Number.parseFloat(String(cached.distanceKm));
      if (
        isAllowedDeliveryDistanceKm(distanceKm) &&
        !isSuspiciousLocalDistance({
          settings,
          customerCity: input.customerCity,
          distanceKm,
        })
      ) {
        const feeMode = settings.deliveryFeeMode ?? "manual";
        const deliveryFeeCalculated = feeMode !== "manual";
        const feeSettings = settingsForFee(settings);
        const deliveryFee = deliveryFeeCalculated
          ? calculateDeliveryFee(distanceKm, feeSettings)
          : null;
        return {
          estimatedDistanceKm: distanceKm,
          distanceKm,
          source: activeProvider,
          cached: true,
          deliveryFee,
          deliveryFeeCalculated,
          feeSettings,
          origin,
          customerCep: normCustomer,
          customerAddressUsed,
          addressHash,
          distanceQuoteId: buildQuoteId({
            storeCep: origin.storeCep,
            customerCep: normCustomer,
            provider: activeProvider,
            addressHash,
            distanceKm,
          }),
        };
      }
    }
  }

  let distanceKm: number | null = null;
  let source: "openrouteservice" | "approximate_cep" = activeProvider;
  let fallback = false;
  let suspicious = false;

  if (orsReady) {
    if (origin.address.fullAddress && customerFullAddr) {
      distanceKm = await calculateRouteDistanceKm(
        origin.address.fullAddress,
        customerFullAddr,
        getOrsApiKey()!,
      );
    }

    if (
      distanceKm !== null &&
      (isInvalidLocalDeliveryDistanceKm(distanceKm) ||
        isSuspiciousLocalDistance({
          settings,
          customerCity: input.customerCity,
          distanceKm,
        }))
    ) {
      suspicious = true;
      distanceKm = null;
      fallback = true;
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

  if (
    isInvalidLocalDeliveryDistanceKm(distanceKm) ||
    isSuspiciousLocalDistance({
      settings,
      customerCity: input.customerCity,
      distanceKm,
    })
  ) {
    suspicious = true;
    throw new Error(INVALID_LOCAL_DELIVERY_DISTANCE_ERROR);
  }

  const cacheAddressHash = source === "openrouteservice" ? addressHash : "";
  if (useCache && !suspicious) {
    await db
      .insert(deliveryDistanceCacheTable)
      .values({
        originCep: origin.storeCep,
        destinationCep: normCustomer,
        distanceKm: String(distanceKm),
        provider: source,
        addressHash: cacheAddressHash,
      })
      .onConflictDoNothing();
  }

  const feeMode = settings.deliveryFeeMode ?? "manual";
  const deliveryFeeCalculated = feeMode !== "manual";
  const feeSettings = settingsForFee(settings);
  const deliveryFee = deliveryFeeCalculated
    ? calculateDeliveryFee(distanceKm, feeSettings)
    : null;

  return {
    estimatedDistanceKm: distanceKm,
    distanceKm,
    source,
    cached: false,
    ...(fallback ? { fallback: true as const } : {}),
    ...(suspicious ? { suspicious: true as const } : {}),
    deliveryFee,
    deliveryFeeCalculated,
    feeSettings,
    origin,
    customerCep: normCustomer,
    customerAddressUsed,
    addressHash: cacheAddressHash,
    distanceQuoteId: buildQuoteId({
      storeCep: origin.storeCep,
      customerCep: normCustomer,
      provider: source,
      addressHash: cacheAddressHash,
      distanceKm,
    }),
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
