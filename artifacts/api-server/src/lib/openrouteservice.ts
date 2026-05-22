/**
 * OpenRouteService integration for real route distance calculation.
 *
 * Uses:
 *   - ORS Pelias Geocoding API  →  address → [lon, lat]
 *   - ORS Directions API        →  [origin, dest] → distance (meters)
 *
 * API key must be set in env var OPENROUTESERVICE_API_KEY.
 * Falls back gracefully (returns null) when key is missing or any API call fails.
 * All timeouts are short so delivery orders are never blocked by API latency.
 */

import { logger } from "./logger";

const ORS_BASE = "https://api.openrouteservice.org";

interface GeoPoint {
  lat: number;
  lon: number;
}

/** Returns the ORS API key from env, or undefined. */
export function getOrsApiKey(): string | undefined {
  return process.env["OPENROUTESERVICE_API_KEY"] || undefined;
}

/** Returns true when ORS is configured (env var present and non-empty). */
export function isOrsConfigured(): boolean {
  return Boolean(getOrsApiKey());
}

/**
 * Geocodes a free-text address via ORS Pelias.
 * Returns {lat, lon} or null on failure.
 */
export async function geocodeAddress(
  address: string,
  apiKey: string
): Promise<GeoPoint | null> {
  try {
    const url = new URL(`${ORS_BASE}/geocode/search`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("text", address);
    url.searchParams.set("size", "1");
    url.searchParams.set("boundary.country", "BRA");

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, address }, "ORS geocode HTTP error");
      return null;
    }

    const data = await res.json() as {
      features?: Array<{ geometry?: { coordinates?: number[] } }>;
    };

    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;

    return { lon: coords[0] as number, lat: coords[1] as number };
  } catch (err) {
    logger.warn({ err, address }, "ORS geocode exception");
    return null;
  }
}

/**
 * Calculates the driving-route distance in km between two full addresses.
 * Geocodes both addresses and then calls ORS Directions.
 * Returns distance in km (2 decimal places), or null on any failure.
 */
export async function calculateRouteDistanceKm(
  originAddress: string,
  destinationAddress: string,
  apiKey: string
): Promise<number | null> {
  const [origin, destination] = await Promise.all([
    geocodeAddress(originAddress, apiKey),
    geocodeAddress(destinationAddress, apiKey),
  ]);

  if (!origin || !destination) {
    logger.warn(
      { originAddress, destinationAddress },
      "ORS geocoding failed for origin or destination"
    );
    return null;
  }

  try {
    const res = await fetch(`${ORS_BASE}/v2/directions/driving-car`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json, application/geo+json",
      },
      body: JSON.stringify({
        coordinates: [
          [origin.lon, origin.lat],
          [destination.lon, destination.lat],
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: text }, "ORS directions HTTP error");
      return null;
    }

    const data = await res.json() as {
      routes?: Array<{ summary?: { distance?: number } }>;
    };

    const meters = data.routes?.[0]?.summary?.distance;
    if (typeof meters !== "number") return null;

    return Math.round((meters / 1000) * 100) / 100;
  } catch (err) {
    logger.warn({ err }, "ORS directions exception");
    return null;
  }
}
