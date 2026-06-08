import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, deliveryDistanceCacheTable } from "@workspace/db";
import { estimateDistanceKmFromCep, normalizeCep } from "../lib/delivery-fee";
import {
  calculateRouteDistanceKm,
  isOrsConfigured,
  getOrsApiKey,
} from "../lib/openrouteservice";
import { getCurrentActor } from "../middleware/rbac";
import { getOrCreateSettings } from "./settings";

const router: IRouter = Router();

/**
 * POST /delivery/distance
 *
 * Calculates the delivery distance (in km) between the store and a customer address.
 * Uses OpenRouteService when configured + provider=openrouteservice; otherwise falls back
 * to CEP-prefix estimation. Results are cached by CEP pair + provider.
 *
 * Body:
 *   customerCep     string  – customer CEP
 *   storeAddress?   string  – ignored for origin; store settings are used instead
 *   customerAddress? string – full customer address (used by ORS)
 *   customerCity?   string  – customer city (used by ORS)
 *
 * Response:
 *   distanceKm  number
 *   source      "openrouteservice" | "approximate_cep"
 *   cached      boolean
 *   fallback?   true         (present when ORS was requested but fell back to CEP)
 */
router.post("/delivery/distance", async (req, res): Promise<void> => {
  const { customerCep, customerAddress, customerCity } = req.body ?? {};
  const actor = await getCurrentActor(req);
  const settings = await getOrCreateSettings(actor.storeId);

  if (!customerCep) {
    res.status(400).json({ error: "customerCep é obrigatório." });
    return;
  }

  const normStore = normalizeCep(String(settings.storeCep ?? ""));
  const normCustomer = normalizeCep(String(customerCep));

  if (!normStore) {
    res.status(400).json({
      error:
        "Configure o CEP da loja em Configurações para calcular rotas com precisão.",
    });
    return;
  }

  if (!normCustomer) {
    res
      .status(400)
      .json({ error: "CEP do cliente inválido. Use 8 dígitos numéricos." });
    return;
  }
  const providerPref = settings.distanceProvider ?? "approximate_cep";
  const useCache = settings.useDistanceCache !== "false";

  const orsReady = providerPref === "openrouteservice" && isOrsConfigured();
  const activeProvider = orsReady ? "openrouteservice" : "approximate_cep";

  // ── Cache lookup ──────────────────────────────────────────────────────────
  if (useCache) {
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
      req.log.info(
        { normStore, normCustomer, provider: activeProvider },
        "delivery distance served from cache",
      );
      res.json({
        distanceKm: parseFloat(String(cached.distanceKm)),
        source: activeProvider,
        cached: true,
      });
      return;
    }
  }

  // ── Real calculation ──────────────────────────────────────────────────────
  let distanceKm: number | null = null;
  let source = activeProvider;
  let fallback = false;

  if (orsReady) {
    const apiKey = getOrsApiKey()!;
    const storeFullAddr = [
      settings.storeCep,
      settings.storeAddress,
      settings.storeNumber,
      settings.storeNeighborhood,
      settings.storeCity,
      settings.storeState,
      settings.storeCountry,
    ]
      .filter(Boolean)
      .join(", ");
    const customerFullAddr = [customerAddress, customerCity ?? ""]
      .filter(Boolean)
      .join(", ");

    if (storeFullAddr && customerFullAddr) {
      distanceKm = await calculateRouteDistanceKm(
        storeFullAddr,
        customerFullAddr,
        apiKey,
      );
    }

    if (distanceKm === null) {
      req.log.warn(
        { normStore, normCustomer },
        "ORS failed — falling back to CEP estimation",
      );
      source = "approximate_cep";
      fallback = true;
    }
  }

  // ── CEP fallback ──────────────────────────────────────────────────────────
  if (distanceKm === null) {
    distanceKm = estimateDistanceKmFromCep(normStore, normCustomer);
    source = "approximate_cep";
  }

  if (distanceKm === null) {
    res.status(422).json({ error: "Não foi possível calcular a distância." });
    return;
  }

  // ── Save to cache ─────────────────────────────────────────────────────────
  if (useCache) {
    await db
      .insert(deliveryDistanceCacheTable)
      .values({
        originCep: normStore,
        destinationCep: normCustomer,
        distanceKm: String(distanceKm),
        provider: source,
      })
      .onConflictDoNothing();
  }

  req.log.info(
    {
      storeId: actor.storeId,
      normStore,
      normCustomer,
      distanceKm,
      source,
      fallback,
    },
    "delivery distance calculated",
  );

  res.json({
    distanceKm,
    source,
    cached: false,
    ...(fallback ? { fallback: true } : {}),
  });
});

export default router;
