import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storeMembersTable, userEntitlementsTable } from "@workspace/db";
import { resolveAuthenticatedContext } from "../lib/auth";
import { ensurePendingEntitlement, isEntitlementPlan } from "../lib/entitlements";

const router: IRouter = Router();

router.get("/billing/entitlement", async (req, res): Promise<void> => {
  const context = await resolveAuthenticatedContext(req);
  if (!context) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }
  if (context.platformRole) {
    res.json({ entitlement: null, canCreateStore: true });
    return;
  }
  const entitlement = await ensurePendingEntitlement(context.user.id);
  res.json({
    entitlement,
    canCreateStore: entitlement.status === "active" || entitlement.status === "trialing",
  });
});

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
  const [membership] = await db
    .select({ id: storeMembersTable.id })
    .from(storeMembersTable)
    .where(eq(storeMembersTable.userId, context.user.id))
    .limit(1);
  if (membership) {
    res.status(409).json({ error: "Usuário já possui loja." });
    return;
  }
  const plan = req.body?.plan;
  if (!isEntitlementPlan(plan)) {
    res.status(400).json({ error: "Plano inválido." });
    return;
  }
  const [entitlement] = await db
    .insert(userEntitlementsTable)
    .values({ userId: context.user.id, plan, status: "pending", source: "system" })
    .onConflictDoUpdate({
      target: userEntitlementsTable.userId,
      set: { plan, status: "pending", source: "system", updatedAt: new Date() },
    })
    .returning();
  res.json({ success: true, entitlement });
});

export default router;
