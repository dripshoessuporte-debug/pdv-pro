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

type NormalizedDeliveryPaymentMethod =
  | "cash"
  | "pix"
  | "credit_card"
  | "debit_card"
  | "voucher"
  | "platform";

function normalizeDeliveryPaymentMethod(
  value: unknown,
): NormalizedDeliveryPaymentMethod {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "dinheiro" || normalized === "cash") return "cash";
  if (normalized === "pix") return "pix";
  if (
    normalized === "cartao" ||
    normalized === "cartão" ||
    normalized === "credito" ||
    normalized === "crédito" ||
    normalized === "credit_card"
  ) {
    return "credit_card";
  }
  if (
    normalized === "debito" ||
    normalized === "débito" ||
    normalized === "debit_card"
  ) {
    return "debit_card";
  }
  if (normalized === "voucher") return "voucher";

  return "platform";
}

function isRestaurantReceivedPaymentMethod(method: string): boolean {
  return ["cash", "pix", "credit_card", "debit_card", "voucher"].includes(
    method,
  );
}

async function buildReconciliationSummary(
  register: typeof cashRegistersTable.$inferSelect,
) {
  const closedPaidOrders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.storeId, register.storeId),
        eq(ordersTable.status, "closed"),
        sql`(${ordersTable.paidAt} >= ${register.openedAt} or ${ordersTable.closedAt} >= ${register.openedAt})`,
        register.closedAt
          ? sql`(${ordersTable.paidAt} <= ${register.closedAt} or ${ordersTable.closedAt} <= ${register.closedAt})`
          : sql`true`,
      ),
    );

  const missingPaymentRows = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .leftJoin(paymentsTable, eq(paymentsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.storeId, register.storeId),
        eq(ordersTable.status, "closed"),
        sql`(${ordersTable.paidAt} >= ${register.openedAt} or ${ordersTable.closedAt} >= ${register.openedAt})`,
        sql`${paymentsTable.id} is null`,
      ),
    );

  const paymentRows = await db
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.storeId, register.storeId),
        eq(paymentsTable.status, "approved"),
        sql`${paymentsTable.createdAt} >= ${register.openedAt}`,
        register.closedAt
          ? sql`${paymentsTable.createdAt} <= ${register.closedAt}`
          : sql`true`,
      ),
    );

  const movementRows = await db
    .select({ orderId: cashMovementsTable.orderId })
    .from(cashMovementsTable)
    .where(
      and(
        eq(cashMovementsTable.cashRegisterId, register.id),
        eq(cashMovementsTable.type, "payment"),
      ),
    );

  const missingCashMovementRows = await db
    .select({ id: ordersTable.id })
    .from(paymentsTable)
    .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .leftJoin(
      cashMovementsTable,
      and(
        eq(cashMovementsTable.orderId, ordersTable.id),
        eq(cashMovementsTable.type, "payment"),
      ),
    )
    .where(
      and(
        eq(ordersTable.storeId, register.storeId),
        eq(paymentsTable.status, "approved"),
        sql`${paymentsTable.method} in ('cash', 'pix', 'credit_card', 'debit_card', 'voucher')`,
        sql`${paymentsTable.createdAt} >= ${register.openedAt}`,
        sql`${cashMovementsTable.id} is null`,
      ),
    );

  return {
    paidOrdersCount: closedPaidOrders.length,
    paymentRecordsCount: paymentRows.length,
    cashPaymentMovementCount: movementRows.length,
    missingPaymentOrderIds: missingPaymentRows.map((row) => row.id),
    missingCashMovementOrderIds: missingCashMovementRows.map((row) => row.id),
  };
}

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
  const totalPlatform = parseFloat(
    String(platformPaymentsSummary?.total ?? "0"),
  );
  const totalRestaurantReceived =
    totalCash + totalPix + totalCredit + totalDebit + totalVoucher;
  const totalSales = totalRestaurantReceived + totalPlatform;
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

  let reconciliation:
    | Awaited<ReturnType<typeof buildReconciliationSummary>>
    | undefined;
  try {
    reconciliation = await buildReconciliationSummary(register);
  } catch (error) {
    console.warn("Failed to build cash reconciliation summary", error);
  }

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
      totalRestaurantReceived,
      totalSales,
      totalWithdrawals,
      totalSupplies,
      totalManualIn,
      expectedCash,
      reconciliation,
    },
  };
}

router.get("/cash/current", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  if (
    !["max_control", "atendente"].includes(actor.role) &&
    !actor.isDevelopmentFallback
  ) {
    res
      .status(403)
      .json({ error: "Você não tem permissão para acessar o caixa." });
    return;
  }
  const conditions = [
    eq(cashRegistersTable.storeId, actor.storeId),
    eq(cashRegistersTable.status, "open"),
  ];

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

router.post("/cash/reconcile/current", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  if (actor.role !== "max_control" && !actor.isDevelopmentFallback) {
    res
      .status(403)
      .json({ error: "Você não tem permissão para reconciliar o caixa." });
    return;
  }

  const [register] = await db
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

  if (!register) {
    res.status(404).json({ error: "No open cash register" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const candidates = await tx
      .select({
        id: ordersTable.id,
        totalAmount: ordersTable.totalAmount,
        deliveryPaymentMethod: ordersTable.deliveryPaymentMethod,
        paidAt: ordersTable.paidAt,
      })
      .from(ordersTable)
      .leftJoin(paymentsTable, eq(paymentsTable.orderId, ordersTable.id))
      .where(
        and(
          eq(ordersTable.storeId, actor.storeId),
          eq(ordersTable.status, "closed"),
          eq(ordersTable.type, "delivery"),
          sql`${ordersTable.paymentTiming} <> 'on_delivery'`,
          sql`${ordersTable.closedAt} >= ${register.openedAt}`,
          sql`${paymentsTable.id} is null`,
        ),
      );

    const createdPayments: number[] = [];
    const createdMovements: number[] = [];
    const skippedOrders: number[] = [];

    for (const order of candidates) {
      const method = normalizeDeliveryPaymentMethod(
        order.deliveryPaymentMethod,
      );
      const amount = String(order.totalAmount ?? "0");
      const [payment] = await tx
        .insert(paymentsTable)
        .values({
          orderId: order.id,
          amount,
          method,
          status: "approved",
          change: null,
          paidAt: order.paidAt ?? new Date(),
        })
        .returning({ id: paymentsTable.id });

      if (payment) createdPayments.push(order.id);
      else skippedOrders.push(order.id);

      if (isRestaurantReceivedPaymentMethod(method)) {
        const [existingMovement] = await tx
          .select({ id: cashMovementsTable.id })
          .from(cashMovementsTable)
          .where(
            and(
              eq(cashMovementsTable.orderId, order.id),
              eq(cashMovementsTable.type, "payment"),
            ),
          )
          .limit(1);

        if (!existingMovement) {
          await tx.insert(cashMovementsTable).values({
            cashRegisterId: register.id,
            type: "payment",
            amount,
            paymentMethod: method,
            reason: `Pagamento Pedido #${order.id}`,
            orderId: order.id,
            actorUserId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
          });
          createdMovements.push(order.id);
        }
      }
    }

    return { createdPayments, createdMovements, skippedOrders };
  });

  res.json(result);
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
        error:
          "Este caixa pertence à loja atual e está compartilhado com a equipe autorizada.",
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
      actorUserId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
    })
    .returning();

  res.status(201).json({
    ...movement!,
    amount: parseFloat(String(movement!.amount)),
    createdAt: movement!.createdAt.toISOString(),
  });
});

export default router;
