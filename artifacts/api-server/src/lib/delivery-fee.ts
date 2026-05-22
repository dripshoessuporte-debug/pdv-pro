/**
 * Delivery fee calculation utilities.
 *
 * MVP approach: approximate distance from CEP prefix comparison.
 * To integrate a real geocoding API (Google Maps, Mapbox, OpenStreetMap Nominatim, etc.),
 * replace `estimateDistanceKmFromCep` with an async function that calls the external API.
 * All callers are already `async` so no further changes to the rest of the system are needed.
 */

const MVP_MAX_DISTANCE_KM = 8;
const MVP_SAFETY_MAX_FEE = 30;

/**
 * Strips formatting characters from a Brazilian CEP, returning only 8 digits.
 * Returns undefined if the result is not exactly 8 numeric digits.
 */
export function normalizeCep(cep: string): string | undefined {
  const digits = cep.replace(/\D/g, "");
  return digits.length === 8 ? digits : undefined;
}

/**
 * MVP approximation: estimates delivery distance in km using CEP prefix comparison.
 *
 * Brazilian CEPs share prefixes within geographic regions, so comparing the longest
 * common prefix gives a reasonable proximity estimate without any geocoding API.
 *
 * Distance table (conservative urban estimates):
 *   - same CEP (8 digits equal)                        → 0.5 km
 *   - same first 5 digits                              → 1.5 km
 *   - same first 4 digits                              → 2.5 km
 *   - same first 3 digits                              → 4 km
 *   - same first 2 digits                              → 6 km
 *   - same first digit                                 → 7 km
 *   - completely different prefix                      → 8 km
 * Capped at MVP_MAX_DISTANCE_KM (8 km) to prevent overestimates in urban areas.
 *
 * Returns `null` when either CEP is invalid.
 */
export function estimateDistanceKmFromCep(
  storeCep: string,
  customerCep: string
): number | null {
  const s = normalizeCep(storeCep);
  const c = normalizeCep(customerCep);

  if (!s || !c) return null;


  let distKm: number;

  if (s === c) {
    distKm = 0.5;
  } else if (s.slice(0, 5) === c.slice(0, 5)) {
    distKm = 1.5;
  } else if (s.slice(0, 4) === c.slice(0, 4)) {
    distKm = 2.5;
  } else if (s.slice(0, 3) === c.slice(0, 3)) {
    distKm = 4;
  } else if (s.slice(0, 2) === c.slice(0, 2)) {
    distKm = 6;
  } else if (s[0] === c[0]) {
    distKm = 7;
  } else {
    distKm = 8;
  }

  return Math.min(distKm, MVP_MAX_DISTANCE_KM);
}

interface FeeSettings {
  deliveryFeeMode?: string;
  // per_km mode
  deliveryPricePerKm?: number | null;
  // distance_tier mode
  baseDeliveryDistanceKm?: number | null;
  baseDeliveryFee?: number | null;
  additionalPricePerKm?: number | null;
  // shared
  minimumDeliveryFee?: number | null;
  maximumDeliveryFee?: number | null;
}

/**
 * Applies delivery fee rules (price per km, distance tier, min, max) to a distance value.
 *
 * Supports three modes:
 * - per_km:        fee = distanceKm × deliveryPricePerKm
 * - distance_tier: fee = baseDeliveryFee (if dist <= base); baseDeliveryFee + (dist - base) × additionalPricePerKm (if dist > base)
 * - manual:        returns 0 (caller should not invoke this in manual mode)
 *
 * When no maximumDeliveryFee is configured, a safety ceiling of MVP_SAFETY_MAX_FEE
 * is applied to prevent accidentally absurd fees.
 */
export function calculateDeliveryFee(
  distanceKm: number,
  settings: FeeSettings
): number {
  const mode = settings.deliveryFeeMode ?? "per_km";

  let fee: number;

  if (mode === "distance_tier") {
    const baseDist = settings.baseDeliveryDistanceKm ?? 4;
    const baseFee  = settings.baseDeliveryFee ?? 0;
    const addlPerKm = settings.additionalPricePerKm ?? 0;

    if (distanceKm <= baseDist) {
      fee = baseFee;
    } else {
      const excess = distanceKm - baseDist;
      fee = baseFee + excess * addlPerKm;
    }
  } else {
    // per_km (default fallback)
    fee = distanceKm * (settings.deliveryPricePerKm ?? 0);
  }

  if (settings.minimumDeliveryFee != null && fee < settings.minimumDeliveryFee) {
    fee = settings.minimumDeliveryFee;
  }

  const effectiveMax =
    settings.maximumDeliveryFee != null
      ? settings.maximumDeliveryFee
      : MVP_SAFETY_MAX_FEE;

  if (fee > effectiveMax) {
    fee = effectiveMax;
  }

  return Math.round(fee * 100) / 100;
}
