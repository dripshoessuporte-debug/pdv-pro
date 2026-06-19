import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  cashMovementsTable,
  cashRegistersTable,
  db,
  ordersTable,
  storeMembersTable,
  usersTable,
} from "@workspace/db";
import { OpenCashRegisterBody } from "@workspace/api-zod";
import { prepareCashSchema } from "../lib/cash-schema";
import { getCurrentActor } from "../middleware/rbac";

const router: IRouter = Router();
const cashOperatorRoles = ["max_control", "atendente"];

function canAccessCash(role: string, isDevelopmentFallback: boolean): boolean {
  return cashOperatorRoles.includes(role) || isDevelopmentFallback;
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function listCashOperators(storeId: number) {
  const operators = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: storeMembersTable.role,
      memberId: storeMembersTable.id,
    })
    .from(storeMembersTable)
    .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
    .where(
      and(
        eq(storeMembersTable.storeId, storeId),
        eq(storeMembersTable.active, true),
        sql`${storeMembersTable.role} in ('max_control', 'atendente')`,
      ),
    )
    .orderBy(usersTable.name);

  return operators;
}

async function resolveSelectedOperator(
  storeId: number,
  operatorUserIdValue: unknown,
  operatorNameValue: unknown,
) {
  const operatorUserId = Number(operatorUserIdValue);
  if (Number.isInteger(operatorUserId) && operatorUserId > 0) {
    const [operator] = await db
      .select({
        userId: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: storeMembersTable.role,
        memberId: storeMembersTable.id,
      })
      .from(storeMembersTable)
      .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
      .where(
        and(
          eq(storeMembersTable.storeId, storeId),
          eq(storeMembersTable.userId, operatorUserId),
          eq(storeMembersTable.active, true),
          sql`${storeMembersTable.role} in ('max_control', 'atendente')`,
        ),
      )
      .limit(1);

    return operator ?? null;
  }

  const operatorName = normalizeName(operatorNameValue);
  if (!operatorName) return null;

  const operators = await listCashOperators(storeId);
  const matches = operators.filter((operator) => normalizeName(operator.name) === operatorName);
  return matches.length === 1 ? matches[0] : null;
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

router.get("/cash/operators", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);

  if (!canAccessCash(actor.role, actor.isDevelopmentFallback)) {
    res.status(403).json({ error: "Você não tem permissão para listar operadores de caixa." });
    return;
  }

  res.json(await listCashOperators(actor.storeId));
});

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

  const selectedOperator = await resolveSelectedOperator(
    actor.storeId,
    req.body?.operatorUserId,
    req.body?.operator,
  );

  if (!selectedOperator) {
    res.status(400).json({
      error: "Selecione um operador cadastrado e ativo na equipe desta loja.",
    });
    return;
  }

  const parsed = OpenCashRegisterBody.safeParse({
    ...req.body,
    operator: selectedOperator.name,
  });

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [register] = await db
    .insert(cashRegistersTable)
    .values({
      storeId: actor.storeId,
      operatorUserId: selectedOperator.userId,
      operator: selectedOperator.name,
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
