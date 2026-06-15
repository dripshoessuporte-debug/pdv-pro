import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, storeMembersTable, storesTable, type EntitlementPlan } from "@workspace/db";
import { resolveAuthenticatedContext } from "../lib/auth";
import { ensurePendingEntitlement } from "../lib/entitlements";

const router: IRouter = Router();
const validPlans = new Set(["basico", "medio", "pro"]);

router.post("/billing/request-access", async (req, res): Promise<void> => {
  const context = await resolveAuthenticatedContext(req);
  if (!context) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }
  if (context.platformRole) {
    res.status(403).json({ error: "Admin Max não solicita plano por este fluxo." });
    return;
  }
  const plan = typeof req.body?.plan === "string" ? req.body.plan : "";
  if (!validPlans.has(plan)) {
    res.status(400).json({ error: "Plano inválido." });
    return;
  }
  const existingMembership = await db
    .select({ id: storeMembersTable.id })
    .from(storeMembersTable)
    .innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id))
    .where(and(eq(storeMembersTable.userId, context.user.id), eq(storeMembersTable.active, true), eq(storesTable.status, "active")))
    .limit(1);
  if (existingMembership.length > 0) {
    res.status(409).json({ error: "Este usuário já possui uma loja vinculada." });
    return;
  }
  const entitlement = await ensurePendingEntitlement(context.user.id, plan as EntitlementPlan);
  res.json({ entitlement: { plan: entitlement.plan, status: entitlement.status, trialEndsAt: entitlement.trialEndsAt?.toISOString() ?? null } });
});

export default router;
