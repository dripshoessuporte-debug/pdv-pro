import { Router, type IRouter } from "express";
import {
  deleteStoreOpenRouteServiceKey,
  getStoreOpenRouteServiceKey,
  getStoreOpenRouteServiceStatus,
  normalizeOpenRouteServiceKey,
  saveStoreOpenRouteServiceKey,
} from "../lib/store-integration-secrets";
import { geocodeAddress } from "../lib/openrouteservice";
import { getCurrentActor } from "../middleware/rbac";

const router: IRouter = Router();

async function requireMaxControl(req: Parameters<typeof getCurrentActor>[0]) {
  const actor = await getCurrentActor(req);
  if (actor.role !== "max_control") {
    const error = new Error(
      "Somente Max Control pode alterar a chave de distância da loja.",
    ) as Error & { status?: number };
    error.status = 403;
    throw error;
  }
  return actor;
}

router.get(
  "/settings/openrouteservice-key",
  async (req, res): Promise<void> => {
    try {
      const actor = await requireMaxControl(req);
      res.json(await getStoreOpenRouteServiceStatus(actor.storeId));
    } catch (error) {
      const candidate = error as Error & { status?: number };
      res.status(candidate.status ?? 500).json({ error: candidate.message });
    }
  },
);

router.put(
  "/settings/openrouteservice-key",
  async (req, res): Promise<void> => {
    try {
      const actor = await requireMaxControl(req);
      await saveStoreOpenRouteServiceKey(actor.storeId, req.body?.apiKey);
      res.json(await getStoreOpenRouteServiceStatus(actor.storeId));
    } catch (error) {
      const candidate = error as Error & { status?: number };
      res.status(candidate.status ?? 400).json({ error: candidate.message });
    }
  },
);

router.delete(
  "/settings/openrouteservice-key",
  async (req, res): Promise<void> => {
    try {
      const actor = await requireMaxControl(req);
      await deleteStoreOpenRouteServiceKey(actor.storeId);
      res.json(await getStoreOpenRouteServiceStatus(actor.storeId));
    } catch (error) {
      const candidate = error as Error & { status?: number };
      res.status(candidate.status ?? 500).json({ error: candidate.message });
    }
  },
);

router.post(
  "/settings/openrouteservice-key/test",
  async (req, res): Promise<void> => {
    try {
      const actor = await requireMaxControl(req);
      const typedKey =
        typeof req.body?.apiKey === "string" && req.body.apiKey.trim()
          ? normalizeOpenRouteServiceKey(req.body.apiKey)
          : null;
      const resolved = typedKey
        ? { apiKey: typedKey, source: "typed" as const }
        : await getStoreOpenRouteServiceKey(actor.storeId);

      if (!resolved.apiKey) {
        res.status(400).json({
          error: "Informe ou salve uma chave OpenRouteService antes de testar.",
        });
        return;
      }

      const point = await geocodeAddress("Curitiba, Paraná, Brasil", resolved.apiKey);
      if (!point) {
        res.status(422).json({
          valid: false,
          error: "A chave não respondeu corretamente no OpenRouteService.",
        });
        return;
      }

      res.json({ valid: true, source: resolved.source });
    } catch (error) {
      const candidate = error as Error & { status?: number };
      res.status(candidate.status ?? 400).json({ error: candidate.message });
    }
  },
);

export default router;
