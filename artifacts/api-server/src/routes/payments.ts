import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import {
  db,
  paymentsTable,
  ordersTable,
  tablesTable,
  orderItemsTable,
  productsTable,
  customersTable,
  cashRegistersTable,
  cashMovementsTable,
} from "@workspace/db";
import {
  CreatePaymentBody,
  GetReceiptParams,
  GetReceiptResponse,
} from "@workspace/api-zod";
import { releaseTableIfOrderClosed } from "../lib/table-release";
import { getOrderFinancialState } from "../lib/order-financial-state";
import { requireOpenShift } from "../middleware/rbac";

const router: IRouter = Router();

function isPlatformPaymentMethod(method: string): boolean {
  return method === "ifood_online" || method === "platform";
}

function assertOrderInCurrentShift(
  order: { cashRegisterId: number | null; createdAt: Date },
  scope: {
    actor: { role: string };
    cashRegisterId: number | null;
    openedAt: Date | null;
  },
): boolean {
  if (scope.actor.role !== "atendente") return true;
  if (!scope.cashRegisterId || !scope.openedAt) return false;
  if (order.cashRegisterId != null)
    return order.cashRegisterId === scope.cashRegisterId;
  return order.createdAt >= scope.openedAt;
}

router.post("/payments", async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scope = await requireOpenShift(req, res);
  if (!scope) return;

  // Pre-check order exists in this store — outside transaction for a fast early exit.
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, parsed.data.orderId),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );

  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  if (!assertOrderInCurrentShift(order, scope)) {
    res.status(403).json({
      error: "Esta visualização mostra apenas dados do seu plantão atual.",
    });
    return;
  }

  if (order.status === "cancelled") {
    res
      .status(409)
      .json({ error: "Pedido cancelado não pode receber pagamento." });
    return;
  }
  if (order.status === "closed") {
    await releaseTableIfOrderClosed(parsed.data.orderId);
    res
      .status(409)
      .json({ error: "Pedido finalizado não pode receber novo pagamento." });
    return;
  }

  const financialBefore = await getOrderFinancialState(parsed.data.orderId);
  if (
    financialBefore.paidAmount >= financialBefore.totalAmount &&
    financialBefore.totalAmount > 0
  ) {
    res.status(409).json({ error: "Pedido já está totalmente pago." });
    return;
  }
  if (
    parsed.data.amount > financialBefore.outstandingAmount &&
    parsed.data.method !== "cash"
  ) {
    res
      .status(400)
      .json({
        error: `Valor maior que o saldo pendente de R$ ${financialBefore.outstandingAmount.toFixed(2)}.`,
      });
    return;
  }

  // Execute every payment step atomically
  let payment;
  try {
    payment = await db.transaction(async (tx) => {
      // SELECT … FOR UPDATE acquires a row-level lock so concurrent transactions
      // must wait until this one commits — prevents the double-payment race.
      const [freshOrder] = await tx
        .select({
          status: ordersTable.status,
          paidAt: ordersTable.paidAt,
          tableId: ordersTable.tableId,
          cashRegisterId: ordersTable.cashRegisterId,
          createdAt: ordersTable.createdAt,
        })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.id, parsed.data.orderId),
            eq(ordersTable.storeId, scope.actor.storeId),
          ),
        )
        .for("update");

      if (
        !freshOrder ||
        freshOrder.status === "closed" ||
        freshOrder.status === "cancelled"
      ) {
        const err = new Error(
          "Pedido finalizado ou cancelado não pode receber pagamento.",
        ) as Error & { alreadyPaid: true };
        err.alreadyPaid = true;
        throw err;
      }

      if (!assertOrderInCurrentShift(freshOrder, scope)) {
        const err = new Error(
          "Esta visualização mostra apenas dados do seu plantão atual.",
        ) as Error & { forbiddenShift: true };
        err.forbiddenShift = true;
        throw err;
      }

      const financialNow = await getOrderFinancialState(
        parsed.data.orderId,
        tx as unknown as typeof db,
      );
      if (
        financialNow.paidAmount >= financialNow.totalAmount &&
        financialNow.totalAmount > 0
      ) {
        const err = new Error(
          "Pedido já está totalmente pago.",
        ) as Error & { fullyPaid?: boolean };
        err.fullyPaid = true;
        throw err;
      }

      if (
        parsed.data.amount > financialNow.outstandingAmount &&
        parsed.data.method !== "cash"
      ) {
        const err = new Error(
          `Valor maior que o saldo pendente de R$ ${financialNow.outstandingAmount.toFixed(2)}.`,
        ) as Error & { amountAboveOutstanding?: boolean };
        err.amountAboveOutstanding = true;
        throw err;
      }

      const paymentAmount =
        parsed.data.method === "cash"
          ? Math.min(parsed.data.amount, financialNow.outstandingAmount)
          : parsed.data.amount;
      let change: string | null = null;
      if (
        parsed.data.method === "cash" &&
        (parsed.data.amountTendered !== undefined ||
          parsed.data.amount > financialNow.outstandingAmount)
      ) {
        const tendered = parsed.data.amountTendered ?? parsed.data.amount;
        change = String(
          Math.max(0, tendered - paymentAmount),
        );
      }

      // Step 1: create payment record
      const [newPayment] = await tx
        .insert(paymentsTable)
        .values({
          orderId: parsed.data.orderId,
          amount: String(paymentAmount),
          method: parsed.data.method,
          status: "approved",
          change,
        })
        .returning();

      const paymentUpdate: Record<string, unknown> = {};
      if (!freshOrder.paidAt) paymentUpdate.paidAt = new Date();
      if (parsed.data.finalizeAfterPayment) {
        if (freshOrder.status !== "ready") {
          const err = new Error(
            "Pedido pago, mas ainda não está pronto para finalizar.",
          ) as Error & { notReadyToFinalize: true };
          err.notReadyToFinalize = true;
          throw err;
        }
        paymentUpdate.status = "closed";
        paymentUpdate.closedAt = new Date();
      }
      if (Object.keys(paymentUpdate).length > 0) {
        await tx
          .update(ordersTable)
          .set(paymentUpdate)
          .where(
            and(
              eq(ordersTable.id, parsed.data.orderId),
              eq(ordersTable.storeId, scope.actor.storeId),
            ),
          );
      }

      if (parsed.data.finalizeAfterPayment) {
        await releaseTableIfOrderClosed(
          parsed.data.orderId,
          tx as unknown as typeof db,
        );
      }

      // Step 4: register restaurant-received payments in the open cash register.
      // Platform/iFood online payments stay only in payments/reporting and never
      // inflate physical cash drawer totals.
      if (!isPlatformPaymentMethod(parsed.data.method)) {
        const [openRegister] = await tx
          .select({ id: cashRegistersTable.id })
          .from(cashRegistersTable)
          .where(
            and(
              eq(cashRegistersTable.storeId, scope.actor.storeId),
              eq(cashRegistersTable.status, "open"),
              ...(scope.actor.role === "atendente" && scope.cashRegisterId
                ? [eq(cashRegistersTable.id, scope.cashRegisterId)]
                : []),
            ),
          )
          .orderBy(sql`${cashRegistersTable.openedAt} DESC`)
          .limit(1);

        if (openRegister) {
          {
            await tx.insert(cashMovementsTable).values({
              cashRegisterId: openRegister.id,
              type: "payment",
              amount: String(paymentAmount),
              paymentMethod: parsed.data.method,
              reason: `Pagamento Pedido #${parsed.data.orderId}`,
              orderId: parsed.data.orderId,
            });
          }
        }
      }

      return newPayment!;
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      (err as { alreadyPaid?: boolean }).alreadyPaid
    ) {
      res.status(409).json({ error: "Este pedido já foi pago/finalizado." });
      return;
    }
    if (
      err &&
      typeof err === "object" &&
      (err as { forbiddenShift?: boolean }).forbiddenShift
    ) {
      res.status(403).json({
        error: "Esta visualização mostra apenas dados do seu plantão atual.",
      });
      return;
    }
    if (
      err &&
      typeof err === "object" &&
      (err as { notReadyToFinalize?: boolean }).notReadyToFinalize
    ) {
      res
        .status(409)
        .json({
          error: "Pedido pago, mas ainda não está pronto para finalizar.",
      });
      return;
    }
    if (
      err &&
      typeof err === "object" &&
      (err as { fullyPaid?: boolean }).fullyPaid
    ) {
      res.status(409).json({ error: "Pedido já está totalmente pago." });
      return;
    }
    if (
      err &&
      typeof err === "object" &&
      (err as { amountAboveOutstanding?: boolean }).amountAboveOutstanding
    ) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Valor maior que o saldo pendente.",
      });
      return;
    }
    throw err;
  }

  res.status(201).json({
    ...payment,
    amount: parseFloat(String(payment.amount)),
    change: payment.change !== null ? parseFloat(String(payment.change)) : null,
    createdAt: payment.createdAt.toISOString(),
  });
});

router.get("/payments/:orderId/receipt", async (req, res): Promise<void> => {
  const params = GetReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scope = await requireOpenShift(req, res);
  if (!scope) return;

  const [order] = await db
    .select({
      id: ordersTable.id,
      tableId: ordersTable.tableId,
      tableNumber: tablesTable.number,
      customerId: ordersTable.customerId,
      customerName: customersTable.name,
      status: ordersTable.status,
      type: ordersTable.type,
      notes: ordersTable.notes,
      totalAmount: ordersTable.totalAmount,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
      cashRegisterId: ordersTable.cashRegisterId,
    })
    .from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(
      and(
        eq(ordersTable.id, params.data.orderId),
        eq(ordersTable.storeId, scope.actor.storeId),
      ),
    );

  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  if (!assertOrderInCurrentShift(order, scope)) {
    res.status(403).json({
      error: "Esta visualização mostra apenas dados do seu plantão atual.",
    });
    return;
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.orderId, params.data.orderId));

  if (!payment) {
    res.status(404).json({ error: "Pagamento não encontrado." });
    return;
  }

  const items = await db
    .select({
      id: orderItemsTable.id,
      orderId: orderItemsTable.orderId,
      productId: orderItemsTable.productId,
      productName: productsTable.name,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
      totalPrice: orderItemsTable.totalPrice,
      notes: orderItemsTable.notes,
    })
    .from(orderItemsTable)
    .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, params.data.orderId));

  const receipt = {
    order: {
      ...order,
      totalAmount: parseFloat(String(order.totalAmount)),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: items.map((item) => ({
        ...item,
        unitPrice: parseFloat(String(item.unitPrice)),
        totalPrice: parseFloat(String(item.totalPrice)),
      })),
    },
    payment: {
      ...payment,
      amount: parseFloat(String(payment.amount)),
      change:
        payment.change !== null ? parseFloat(String(payment.change)) : null,
      createdAt: payment.createdAt.toISOString(),
    },
    items: items.map((item) => ({
      ...item,
      unitPrice: parseFloat(String(item.unitPrice)),
      totalPrice: parseFloat(String(item.totalPrice)),
    })),
  };

  res.json(GetReceiptResponse.parse(receipt));
});

export default router;
