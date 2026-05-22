/**
 * Delivery fee calculation utilities.
 *
 * MVP approach: approximate distance from CEP numeric difference.
 * To integrate a real geocoding API (Google Maps, Mapbox, OpenStreetMap Nominatim, etc.),
 * replace `estimateDistanceKmFromCep` with an async function that calls the external API.
 * All callers are already `async` so no further changes to the rest of the system are needed.
 */

/**
 * Strips formatting characters from a Brazilian CEP, returning only 8 digits.
 */
export function normalizeCep(cep: string): string {
  return cep.replace(/\D/g, "");
}

/**
 * MVP approximation: estimates delivery distance in km based purely on the
 * numeric difference between the store CEP and the customer CEP.
 *
 * ⚠️  This is NOT a real geographic calculation. CEP numbers in Brazil are
 *   assigned sequentially within regions (south → north), so nearby CEPs tend
 *   to have small numeric differences — but the mapping is far from precise.
 *
 * Calibration for Curitiba/PR (typical metropolitan CEP range 80000-000 → 83999-999):
 *   - diff  1 000 → ~0.5 km  (same block / adjacent street)
 *   - diff  3 000 → ~1 km    (a few neighbourhoods apart)
 *   - diff 12 000 → ~4 km    (cross-town)
 *   - diff 30 000 → ~10 km   (edge of metro region)
 *
 * Returns `null` when either CEP is invalid.
 */
export function estimateDistanceKmFromCep(
  storeCep: string,
  customerCep: string
): number | null {
  const s = normalizeCep(storeCep);
  const c = normalizeCep(customerCep);

  if (s.length !== 8 || c.length !== 8) return null;

  const sNum = parseInt(s, 10);
  const cNum = parseInt(c, 10);

  if (isNaN(sNum) || isNaN(cNum)) return null;

  const diff = Math.abs(sNum - cNum);

  // ~3 000 CEP units ≈ 1 km in the Curitiba metro area (MVP heuristic)
  const estimatedKm = Math.max(0.5, diff / 3000);

  // Cap at 50 km to avoid wildly wrong values for cross-state CEPs
  return Math.min(estimatedKm, 50);
}

/**
 * Applies delivery fee rules (price per km, min, max) to a distance value.
 */
export function calculateDeliveryFee(
  distanceKm: number,
  settings: {
    deliveryPricePerKm: number;
    minimumDeliveryFee?: number | null;
    maximumDeliveryFee?: number | null;
  }
): number {
  let fee = distanceKm * settings.deliveryPricePerKm;

  if (settings.minimumDeliveryFee != null && fee < settings.minimumDeliveryFee) {
    fee = settings.minimumDeliveryFee;
  }

  if (settings.maximumDeliveryFee != null && fee > settings.maximumDeliveryFee) {
    fee = settings.maximumDeliveryFee;
  }

  return Math.round(fee * 100) / 100;
}
