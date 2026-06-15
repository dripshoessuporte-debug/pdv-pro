import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  entitlementPlans,
  storeMembersTable,
  storesTable,
  userEntitlementsTable,
} from "@workspace/db";
import { resolveAuthenticatedContext } from "../lib/auth";

const router: IRouter = Router();
const planSet = new Set<string>(entitlementPlans);

router.post("/billing/request-access", async (req, res): Promise<void> => {
  const context = await resolveAuthenticatedContext(req);
  if (!context) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }
  if (context.platformRole) {
    res.status(403).json({ error: "Admin Max não usa solicitação de plano." });
    return;
  }

  const plan = typeof req.body?.plan === "string" ? req.body.plan : "";
  if (!planSet.has(plan)) {
    res.status(400).json({ error: "Plano inválido." });
    return;
  }

  const [membership] = await db
    .select({ id: storeMembersTable.id })
    .from(storeMembersTable)
    .innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id))
    .where(eq(storeMembersTable.userId, context.user.id))
    .limit(1);
  if (membership) {
    res.status(409).json({ error: "Usuário já possui loja vinculada." });
    return;
  }

  await db
    .insert(userEntitlementsTable)
    .values({ userId: context.user.id, plan, status: "pending", source: "system" })
    .onConflictDoUpdate({
      target: userEntitlementsTable.userId,
      set: { plan, status: "pending", source: "system", updatedAt: new Date() },
    });

  res.json({ ok: true, entitlement: { plan, status: "pending", trialEndsAt: null } });
});

export default router;
