import { Router, type IRouter } from "express";
import { getCurrentActor } from "../middleware/rbac";
import {
  calculateDeliveryDistanceForStore,
  deliveryCalculationErrorStatus,
} from "../lib/delivery-distance-calculator";

const router: IRouter = Router();

/**
 * POST /delivery/distance
 *
 * Calculates the delivery distance (in km) from the logged-in store settings
 * origin to a customer CEP/address. The origin is always loaded by actor.storeId;
 * client-provided store CEP/address values are intentionally ignored.
 */
router.post("/delivery/distance", async (req, res): Promise<void> => {
  const { customerCep, customerAddress, customerCity } = req.body ?? {};
  const actor = await getCurrentActor(req);

  if (!customerCep) {
    res.status(400).json({ error: "CEP do cliente inválido." });
    return;
  }

  try {
    const result = await calculateDeliveryDistanceForStore({
      storeId: actor.storeId,
      customerCep: String(customerCep),
      customerAddress: customerAddress ? String(customerAddress) : null,
      customerCity: customerCity ? String(customerCity) : null,
    });

    req.log.info(
      {
        storeId: actor.storeId,
        normStore: result.origin.storeCep,
        normCustomer: result.customerCep,
        distanceKm: result.distanceKm,
        source: result.source,
        fallback: result.fallback ?? false,
      },
      "delivery distance calculated",
    );

    const diagnostic = {
      storeCep: result.origin.storeCep,
      customerCep: result.customerCep,
      distanceKm: result.distanceKm,
      deliveryFeeMode: result.feeSettings.deliveryFeeMode ?? "manual",
      deliveryPricePerKm: result.feeSettings.deliveryPricePerKm,
      baseDeliveryDistanceKm: result.feeSettings.baseDeliveryDistanceKm,
      baseDeliveryFee: result.feeSettings.baseDeliveryFee,
      additionalPricePerKm: result.feeSettings.additionalPricePerKm,
      minimumDeliveryFee: result.feeSettings.minimumDeliveryFee,
      maximumDeliveryFee: result.feeSettings.maximumDeliveryFee,
      deliveryFee: result.deliveryFee,
      deliveryFeeCalculated: result.deliveryFeeCalculated,
      source: result.source,
      cached: result.cached,
    };

    res.json({
      distanceKm: result.distanceKm,
      estimatedDistanceKm: result.estimatedDistanceKm,
      deliveryFee: result.deliveryFee,
      deliveryFeeCalculated: result.deliveryFeeCalculated,
      deliveryFeeMode: diagnostic.deliveryFeeMode,
      source: result.source,
      cached: result.cached,
      ...(process.env.NODE_ENV !== "production" ? diagnostic : {}),
      ...(result.fallback ? { fallback: true } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(deliveryCalculationErrorStatus(error)).json({ error: message });
  }
});

export default router;
