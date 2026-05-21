import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, cashRegistersTable, cashMovementsTable, ordersTable } from "@workspace/db";
import {
  OpenCashRegisterBody,
  CloseCashRegisterBody,
  AddCashMovementBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function buildRegisterDetail(register: typeof cashRegistersTable.$inferSelect) {
  const movements = await db
    .select()
    .from(cashMovementsTable)
    .where(eq(cashMovementsTable.cashRegisterId, register.id))
    .orderBy(cashMovementsTable.createdAt);

  const parsed = movements.map((m) => ({
    ...m,
    amount: parseFloat(String(m.amount)),
    createdAt: m.createdAt.toISOString(),
  }));

  const totalCash = parsed.filter((m) => m.type === "payment" && m.paymentMethod === "cash").reduce((s, m) => s + m.amount, 0);
  const totalPix = parsed.filter((m) => m.type === "payment" && m.paymentMethod === "pix").reduce((s, m) => s + m.amount, 0);
  const totalCredit = parsed.filter((m) => m.type === "payment" && m.paymentMethod === "credit_card").reduce((s, m) => s + m.amount, 0);
  const totalDebit = parsed.filter((m) => m.type === "payment" && m.paymentMethod === "debit_card").reduce((s, m) => s + m.amount, 0);
  const totalVoucher = parsed.filter((m) => m.type === "payment" && m.paymentMethod === "voucher").reduce((s, m) => s + m.amount, 0);
  const totalSales = totalCash + totalPix + totalCredit + totalDebit + totalVoucher;
  const totalWithdrawals = parsed.filter((m) => m.type === "withdrawal").reduce((s, m) => s + m.amount, 0);
  const totalSupplies = parsed.filter((m) => m.type === "supply").reduce((s, m) => s + m.amount, 0);
  const totalManualIn = parsed.filter((m) => m.type === "manual_in").reduce((s, m) => s + m.amount, 0);
  const openingAmount = parseFloat(String(register.openingAmount));
  const expectedCash = openingAmount + totalCash + totalSupplies + totalManualIn - totalWithdrawals;

  return {
    ...register,
    openingAmount,
    closingAmount: register.closingAmount !== null ? parseFloat(String(register.closingAmount)) : null,
    openedAt: register.openedAt.toISOString(),
    closedAt: register.closedAt ? register.closedAt.toISOString() : null,
    movements: parsed,
    summary: {
      totalCash,
      totalPix,
      totalCredit,
      totalDebit,
      totalVoucher,
      totalSales,
      totalWithdrawals,
      totalSupplies,
      totalManualIn,
      expectedCash,
    },
  };
}

router.get("/cash/current", async (_req, res): Promise<void> => {
  const [register] = await db
    .select()
    .from(cashRegistersTable)
    .where(eq(cashRegistersTable.status, "open"))
    .orderBy(sql`${cashRegistersTable.openedAt} DESC`)
    .limit(1);

  if (!register) {
    res.status(404).json({ error: "No open cash register" });
    return;
  }

  res.json(await buildRegisterDetail(register));
});

router.post("/cash/open", async (req, res): Promise<void> => {
  const [existingOpen] = await db
    .select()
    .from(cashRegistersTable)
    .where(eq(cashRegistersTable.status, "open"))
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

  const [register] = await db.insert(cashRegistersTable).values({
    operator: parsed.data.operator,
    openingAmount: String(parsed.data.openingAmount),
    notes: parsed.data.notes,
    status: "open",
  }).returning();

  res.status(201).json(await buildRegisterDetail(register!));
});

router.get("/cash/history", async (_req, res): Promise<void> => {
  const registers = await db
    .select()
    .from(cashRegistersTable)
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

  const [register] = await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id, id));
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

  const [register] = await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id, id));
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
    .where(eq(ordersTable.deliveryStatus, "awaiting_settlement"));

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

  const [register] = await db
    .select()
    .from(cashRegistersTable)
    .where(eq(cashRegistersTable.id, parsed.data.cashRegisterId));

  if (!register) {
    res.status(404).json({ error: "Cash register not found" });
    return;
  }
  if (register.status === "closed") {
    res.status(409).json({ error: "Cannot add movement to a closed cash register" });
    return;
  }

  const [movement] = await db.insert(cashMovementsTable).values({
    cashRegisterId: parsed.data.cashRegisterId,
    type: parsed.data.type,
    amount: String(parsed.data.amount),
    paymentMethod: parsed.data.paymentMethod,
    reason: parsed.data.reason,
    orderId: parsed.data.orderId,
  }).returning();

  res.status(201).json({
    ...movement!,
    amount: parseFloat(String(movement!.amount)),
    createdAt: movement!.createdAt.toISOString(),
  });
});

export default router;
