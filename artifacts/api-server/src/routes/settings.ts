import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storeSettingsTable } from "@workspace/db";
import { isOrsConfigured } from "../lib/openrouteservice";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(storeSettingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(storeSettingsTable).values({}).returning();
  return created;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({ ...settings, orsConfigured: isOrsConfigured() });
});

router.put("/settings", async (req, res): Promise<void> => {
  const {
    storeName,
    storePhone,
    storeEmail,
    storeCep,
    storeAddress,
    storeNumber,
    storeNeighborhood,
    storeCity,
    storeState,
    storeCountry,
    deliveryDispatchTimeMinutes,
    maxOrdersPerRoute,
    routeGroupingMode,
    deliveryFeeMode,
    deliveryPricePerKm,
    baseDeliveryDistanceKm,
    baseDeliveryFee,
    additionalPricePerKm,
    minimumDeliveryFee,
    maximumDeliveryFee,
    distanceProvider,
    useDistanceCache,
  } = req.body ?? {};

  const settings = await getOrCreateSettings();

  const updates: Record<string, unknown> = {};
  if (storeName !== undefined) updates.storeName = String(storeName);
  if (storePhone !== undefined) updates.storePhone = storePhone ? String(storePhone) : null;
  if (storeEmail !== undefined) updates.storeEmail = storeEmail ? String(storeEmail) : null;
  if (storeCep !== undefined) updates.storeCep = storeCep ? String(storeCep) : null;
  if (storeAddress !== undefined) updates.storeAddress = storeAddress ? String(storeAddress) : null;
  if (storeNumber !== undefined) updates.storeNumber = storeNumber ? String(storeNumber) : null;
  if (storeNeighborhood !== undefined) updates.storeNeighborhood = storeNeighborhood ? String(storeNeighborhood) : null;
  if (storeCity !== undefined) updates.storeCity = storeCity ? String(storeCity) : "";
  if (storeState !== undefined) updates.storeState = storeState ? String(storeState) : "";
  if (storeCountry !== undefined) updates.storeCountry = storeCountry ? String(storeCountry) : "Brasil";
  if (deliveryDispatchTimeMinutes !== undefined) {
    const v = parseInt(String(deliveryDispatchTimeMinutes), 10);
    if (!isNaN(v) && v >= 1) updates.deliveryDispatchTimeMinutes = v;
  }
  if (maxOrdersPerRoute !== undefined) {
    const v = parseInt(String(maxOrdersPerRoute), 10);
    if (!isNaN(v) && v >= 1 && v <= 10) updates.maxOrdersPerRoute = v;
  }
  if (routeGroupingMode !== undefined && ["neighborhood", "distance", "hybrid"].includes(String(routeGroupingMode))) {
    updates.routeGroupingMode = String(routeGroupingMode);
  }
  if (deliveryFeeMode !== undefined && ["manual", "per_km", "distance_tier"].includes(String(deliveryFeeMode))) {
    updates.deliveryFeeMode = String(deliveryFeeMode);
  }
  if (deliveryPricePerKm !== undefined) {
    const v = parseFloat(String(deliveryPricePerKm));
    updates.deliveryPricePerKm = !isNaN(v) && v >= 0 ? String(v) : null;
  }
  if (baseDeliveryDistanceKm !== undefined) {
    const v = parseFloat(String(baseDeliveryDistanceKm));
    updates.baseDeliveryDistanceKm = !isNaN(v) && v >= 0 ? String(v) : null;
  }
  if (baseDeliveryFee !== undefined) {
    const v = parseFloat(String(baseDeliveryFee));
    updates.baseDeliveryFee = !isNaN(v) && v >= 0 ? String(v) : null;
  }
  if (additionalPricePerKm !== undefined) {
    const v = parseFloat(String(additionalPricePerKm));
    updates.additionalPricePerKm = !isNaN(v) && v >= 0 ? String(v) : null;
  }
  if (minimumDeliveryFee !== undefined) {
    const v = parseFloat(String(minimumDeliveryFee));
    updates.minimumDeliveryFee = !isNaN(v) && v >= 0 ? String(v) : null;
  }
  if (maximumDeliveryFee !== undefined) {
    const v = parseFloat(String(maximumDeliveryFee));
    updates.maximumDeliveryFee = !isNaN(v) && v >= 0 ? String(v) : null;
  }
  if (distanceProvider !== undefined) {
    const valid = ["approximate_cep", "openrouteservice"];
    if (valid.includes(String(distanceProvider))) updates.distanceProvider = String(distanceProvider);
  }
  if (useDistanceCache !== undefined) {
    updates.useDistanceCache = String(useDistanceCache) === "false" ? "false" : "true";
  }

  if (Object.keys(updates).length === 0) {
    res.json(settings);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [updated] = await db
    .update(storeSettingsTable)
    .set(updates as any)
    .where(eq(storeSettingsTable.id, settings.id))
    .returning();

  res.json(updated);
});

export default router;
export { getOrCreateSettings };
