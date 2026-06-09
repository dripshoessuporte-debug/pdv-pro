import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  cashRegistersTable,
  cashMovementsTable,
  ordersTable,
  paymentsTable,
} from "@workspace/db";
import {
  OpenCashRegisterBody,
  CloseCashRegisterBody,
  AddCashMovementBody,
} from "@workspace/api-zod";
import { getCurrentActor, requireOpenShift } from "../middleware/rbac";

const router: IRouter = Router();

async function buildRegisterDetail(
  register: typeof cashRegistersTable.$inferSelect,
) {
  const movements = await db
    .select({
      id: cashMovementsTable.id,
      cashRegisterId: cashMovementsTable.cashRegisterId,
      type: cashMovementsTable.type,
      amount: cashMovementsTable.amount,
      paymentMethod: cashMovementsTable.paymentMethod,
      reason: cashMovementsTable.reason,
      orderId: cashMovementsTable.orderId,
      createdAt: cashMovementsTable.createdAt,
      orderCreatedAt: ordersTable.createdAt,
      orderPaidAt: ordersTable.paidAt,
    })
    .from(cashMovementsTable)
    .leftJoin(ordersTable, eq(cashMovementsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(cashMovementsTable.cashRegisterId, register.id),
        sql`${ordersTable.id} is null or ${ordersTable.storeId} = ${register.storeId}`,
      ),
    )
    .orderBy(desc(cashMovementsTable.createdAt));

  const parsed = movements.map((m) => ({
    ...m,
    amount: parseFloat(String(m.amount)),
    createdAt: m.createdAt.toISOString(),
    orderCreatedAt: m.orderCreatedAt?.toISOString() ?? null,
    orderPaidAt: m.orderPaidAt?.toISOString() ?? null,
  }));

  const totalCash = parsed
    .filter((m) => m.type === "payment" && m.paymentMethod === "cash")
    .reduce((s, m) => s + m.amount, 0);
  const totalPix = parsed
    .filter((m) => m.type === "payment" && m.paymentMethod === "pix")
    .reduce((s, m) => s + m.amount, 0);
  const totalCredit = parsed
    .filter((m) => m.type === "payment" && m.paymentMethod === "credit_card")
    .reduce((s, m) => s + m.amount, 0);
  const totalDebit = parsed
    .filter((m) => m.type === "payment" && m.paymentMethod === "debit_card")
    .reduce((s, m) => s + m.amount, 0);
  const totalVoucher = parsed
    .filter((m) => m.type === "payment" && m.paymentMethod === "voucher")
    .reduce((s, m) => s + m.amount, 0);
  const [platformPaymentsSummary] = await db
    .select({ total: sql<string>`coalesce(sum(${paymentsTable.amount}), 0)` })
    .from(paymentsTable)
    .leftJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.storeId, register.storeId),
        eq(paymentsTable.status, "approved"),
        sql`${paymentsTable.method} in ('ifood_online', 'platform')`,
        sql`${paymentsTable.createdAt} >= ${register.openedAt}`,
        register.closedAt
          ? sql`${paymentsTable.createdAt} <= ${register.closedAt}`
          : sql`true`,
      ),
    );
  const totalPlatform = parseFloat(String(platformPaymentsSummary?.total ?? "0"));
  const totalSales =
    totalCash + totalPix + totalCredit + totalDebit + totalVoucher;
  const totalWithdrawals = parsed
    .filter((m) => m.type === "withdrawal")
    .reduce((s, m) => s + m.amount, 0);
  const totalSupplies = parsed
    .filter((m) => m.type === "supply")
    .reduce((s, m) => s + m.amount, 0);
  const totalManualIn = parsed
    .filter((m) => m.type === "manual_in")
    .reduce((s, m) => s + m.amount, 0);
  const openingAmount = parseFloat(String(register.openingAmount));
  const expectedCash =
    openingAmount +
    totalCash +
    totalSupplies +
    totalManualIn -
    totalWithdrawals;

  return {
    ...register,
    openingAmount,
    closingAmount:
      register.closingAmount !== null
        ? parseFloat(String(register.closingAmount))
        : null,
    openedAt: register.openedAt.toISOString(),
    closedAt: register.closedAt ? register.closedAt.toISOString() : null,
    movements: parsed,
    summary: {
      totalCash,
      totalPix,
      totalCredit,
      totalDebit,
      totalVoucher,
      totalPlatform,
      totalSales,
      totalWithdrawals,
      totalSupplies,
      totalManualIn,
      expectedCash,
    },
  };
}

router.get("/cash/current", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const conditions = [
    eq(cashRegistersTable.storeId, actor.storeId),
    eq(cashRegistersTable.status, "open"),
  ];
  if (actor.role === "atendente") {
    if (actor.id)
      conditions.push(eq(cashRegistersTable.operatorUserId, actor.id));
    else conditions.push(sql`${cashRegistersTable.operator} = ${actor.name}`);
  }

  const [register] = await db
    .select()
    .from(cashRegistersTable)
    .where(and(...conditions))
    .orderBy(sql`${cashRegistersTable.openedAt} DESC`)
    .limit(1);

  if (!register) {
    res.status(404).json({ error: "No open cash register" });
    return;
  }

  res.json(await buildRegisterDetail(register));
});

router.post("/cash/open", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const [existingOpen] = await db
    .select()
    .from(cashRegistersTable)
    .where(
      and(
        eq(cashRegistersTable.storeId, actor.storeId),
        eq(cashRegistersTable.status, "open"),
      ),
    )
    .limit(1);

  if (existingOpen) {
    res.status(409).json({ error: "There is already an open cash register" });
    return;
  }

  const parsed = OpenCashRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [register] = await db
    .insert(cashRegistersTable)
    .values({
      storeId: actor.storeId,
      operatorUserId: actor.id,
      operator: actor.role === "atendente" ? actor.name : parsed.data.operator,
      openingAmount: String(parsed.data.openingAmount),
      notes: parsed.data.notes,
      status: "open",
    })
    .returning();

  res.status(201).json(await buildRegisterDetail(register!));
});

router.get("/cash/history", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  if (actor.role === "atendente") {
    const scope = await requireOpenShift(req, res);
    if (!scope) return;
    const [register] = await db
      .select()
      .from(cashRegistersTable)
      .where(eq(cashRegistersTable.id, scope.cashRegisterId!));
    res.json(register ? [await buildRegisterDetail(register)] : []);
    return;
  }

  const registers = await db
    .select()
    .from(cashRegistersTable)
    .where(eq(cashRegistersTable.storeId, actor.storeId))
    .orderBy(sql`${cashRegistersTable.openedAt} DESC`);

  const details = await Promise.all(registers.map(buildRegisterDetail));
  res.json(details);
});

router.get("/cash/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const actor = await getCurrentActor(req);
  const [register] = await db
    .select()
    .from(cashRegistersTable)
    .where(
      and(
        eq(cashRegistersTable.id, id),
        eq(cashRegistersTable.storeId, actor.storeId),
      ),
    );
  if (!register) {
    res.status(404).json({ error: "Cash register not found" });
    return;
  }

  res.json(await buildRegisterDetail(register));
});

router.post("/cash/:id/close", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = CloseCashRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actor = await getCurrentActor(req);
  const [register] = await db
    .select()
    .from(cashRegistersTable)
    .where(
      and(
        eq(cashRegistersTable.id, id),
        eq(cashRegistersTable.storeId, actor.storeId),
      ),
    );
  if (!register) {
    res.status(404).json({ error: "Cash register not found" });
    return;
  }
  if (register.status === "closed") {
    res.status(409).json({ error: "Cash register is already closed" });
    return;
  }

  const [pending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.storeId, actor.storeId),
        eq(ordersTable.deliveryStatus, "awaiting_settlement"),
      ),
    );

  if (Number(pending?.count ?? 0) > 0) {
    res.status(409).json({
      error: `Existem ${pending?.count} entrega(s) pendente(s) de baixa financeira. Registre os recebimentos antes de fechar o caixa.`,
      pendingSettlements: Number(pending?.count ?? 0),
    });
    return;
  }

  const [updated] = await db
    .update(cashRegistersTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      closingAmount: String(parsed.data.closingAmount),
      closingNotes: parsed.data.closingNotes,
    })
    .where(eq(cashRegistersTable.id, id))
    .returning();

  res.json(await buildRegisterDetail(updated!));
});

router.post("/cash/movements", async (req, res): Promise<void> => {
  const parsed = AddCashMovementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actor = await getCurrentActor(req);
  if (actor.role === "atendente") {
    const scope = await requireOpenShift(req, res);
    if (!scope) return;
    if (scope.cashRegisterId !== parsed.data.cashRegisterId) {
      res.status(403).json({
        error: "Esta visualização mostra apenas dados do seu plantão atual.",
      });
      return;
    }
  }

  const [register] = await db
    .select()
    .from(cashRegistersTable)
    .where(
      and(
        eq(cashRegistersTable.id, parsed.data.cashRegisterId),
        eq(cashRegistersTable.storeId, actor.storeId),
      ),
    );

  if (!register) {
    res.status(404).json({ error: "Cash register not found" });
    return;
  }
  if (register.status === "closed") {
    res
      .status(409)
      .json({ error: "Cannot add movement to a closed cash register" });
    return;
  }

  const [movement] = await db
    .insert(cashMovementsTable)
    .values({
      cashRegisterId: parsed.data.cashRegisterId,
      type: parsed.data.type,
      amount: String(parsed.data.amount),
      paymentMethod: parsed.data.paymentMethod,
      reason: parsed.data.reason,
      orderId: parsed.data.orderId,
    })
    .returning();

  res.status(201).json({
    ...movement!,
    amount: parseFloat(String(movement!.amount)),
    createdAt: movement!.createdAt.toISOString(),
  });
});

export default router;
