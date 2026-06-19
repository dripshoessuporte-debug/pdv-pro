import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  cashMovementsTable,
  cashRegistersTable,
  db,
  ordersTable,
} from "@workspace/db";
import { OpenCashRegisterBody } from "@workspace/api-zod";
import { prepareCashSchema } from "../lib/cash-schema";
import { getCurrentActor } from "../middleware/rbac";

const router: IRouter = Router();

function canAccessCash(role: string, isDevelopmentFallback: boolean): boolean {
  return ["max_control", "atendente"].includes(role) || isDevelopmentFallback;
}

async function buildCashRegisterResponse(
  register: typeof cashRegistersTable.$inferSelect,
) {
  await prepareCashSchema();

  const movements = await db
    .select({
      id: cashMovementsTable.id,
      cashRegisterId: cashMovementsTable.cashRegisterId,
      type: cashMovementsTable.type,
      amount: cashMovementsTable.amount,
      paymentMethod: cashMovementsTable.paymentMethod,
      reason: cashMovementsTable.reason,
      orderId: cashMovementsTable.orderId,
      actorUserId: cashMovementsTable.actorUserId,
      actorName: cashMovementsTable.actorName,
      actorRole: cashMovementsTable.actorRole,
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

  const parsedMovements = movements.map((movement) => ({
    ...movement,
    amount: Number(movement.amount ?? 0),
    createdAt: movement.createdAt.toISOString(),
    orderCreatedAt: movement.orderCreatedAt?.toISOString() ?? null,
    orderPaidAt: movement.orderPaidAt?.toISOString() ?? null,
  }));

  const totalCash = parsedMovements
    .filter(
      (movement) =>
        movement.type === "payment" && movement.paymentMethod === "cash",
    )
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalPix = parsedMovements
    .filter(
      (movement) => movement.type === "payment" && movement.paymentMethod === "pix",
    )
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalCredit = parsedMovements
    .filter(
      (movement) =>
        movement.type === "payment" && movement.paymentMethod === "credit_card",
    )
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalDebit = parsedMovements
    .filter(
      (movement) =>
        movement.type === "payment" && movement.paymentMethod === "debit_card",
    )
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalVoucher = parsedMovements
    .filter(
      (movement) =>
        movement.type === "payment" && movement.paymentMethod === "voucher",
    )
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalWithdrawals = parsedMovements
    .filter((movement) => movement.type === "withdrawal")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalSupplies = parsedMovements
    .filter((movement) => movement.type === "supply")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalManualIn = parsedMovements
    .filter((movement) => movement.type === "manual_in")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const openingAmount = Number(register.openingAmount ?? 0);

  return {
    ...register,
    openingAmount,
    closingAmount:
      register.closingAmount !== null ? Number(register.closingAmount) : null,
    openedAt: register.openedAt.toISOString(),
    closedAt: register.closedAt ? register.closedAt.toISOString() : null,
    movements: parsedMovements,
    summary: {
      totalCash,
      totalPix,
      totalCredit,
      totalDebit,
      totalVoucher,
      totalPlatform: 0,
      totalRestaurantReceived:
        totalCash + totalPix + totalCredit + totalDebit + totalVoucher,
      totalSales: totalCash + totalPix + totalCredit + totalDebit + totalVoucher,
      totalWithdrawals,
      totalSupplies,
      totalManualIn,
      expectedCash:
        openingAmount + totalCash + totalSupplies + totalManualIn - totalWithdrawals,
    },
  };
}

router.post("/cash/open", async (req, res): Promise<void> => {
  await prepareCashSchema();

  const actor = await getCurrentActor(req);

  if (!canAccessCash(actor.role, actor.isDevelopmentFallback)) {
    res.status(403).json({ error: "Você não tem permissão para abrir caixa." });
    return;
  }

  const [existingOpen] = await db
    .select()
    .from(cashRegistersTable)
    .where(
      and(
        eq(cashRegistersTable.storeId, actor.storeId),
        eq(cashRegistersTable.status, "open"),
      ),
    )
    .orderBy(sql`${cashRegistersTable.openedAt} DESC`)
    .limit(1);

  if (existingOpen) {
    res.status(200).json({
      ...(await buildCashRegisterResponse(existingOpen)),
      alreadyOpen: true,
      message: "Já existe um caixa aberto para esta loja. Usando o caixa atual.",
    });
    return;
  }

  const parsed = OpenCashRegisterBody.safeParse({
    ...req.body,
    operator:
      typeof req.body?.operator === "string" && req.body.operator.trim()
        ? req.body.operator.trim()
        : actor.name,
  });

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [register] = await db
    .insert(cashRegistersTable)
    .values({
      storeId: actor.storeId,
      operatorUserId: actor.id,
      operator: actor.name || parsed.data.operator,
      openingAmount: String(parsed.data.openingAmount),
      notes: parsed.data.notes,
      status: "open",
    })
    .returning();

  res.status(201).json({
    ...(await buildCashRegisterResponse(register!)),
    alreadyOpen: false,
    message: "Caixa aberto para a loja atual.",
  });
});

export default router;
