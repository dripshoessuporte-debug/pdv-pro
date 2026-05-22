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

const router: IRouter = Router();

router.post("/payments", async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Pre-check order exists — outside transaction for a fast early exit
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, parsed.data.orderId));

  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  if (order.status === "closed") {
    res.status(409).json({ error: "Este pedido já foi pago/finalizado." });
    return;
  }

  // Guard against duplicate payment even if the order status was incorrectly
  // reverted (e.g. kitchen marking ready after payment). Check the payments
  // table directly — this is the authoritative source of truth.
  const [existingPayment] = await db
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .where(eq(paymentsTable.orderId, parsed.data.orderId))
    .limit(1);

  if (existingPayment) {
    res.status(409).json({ error: "Este pedido já possui pagamento registrado." });
    return;
  }

  // Execute every payment step atomically
  let payment;
  try {
    payment = await db.transaction(async (tx) => {
      // SELECT … FOR UPDATE acquires a row-level lock so concurrent transactions
      // must wait until this one commits — prevents the double-payment race.
      const [freshOrder] = await tx
        .select({ status: ordersTable.status, tableId: ordersTable.tableId })
        .from(ordersTable)
        .where(eq(ordersTable.id, parsed.data.orderId))
        .for("update");

      if (!freshOrder || freshOrder.status === "closed") {
        const err = new Error("Este pedido já foi pago/finalizado.") as Error & { alreadyPaid: true };
        err.alreadyPaid = true;
        throw err;
      }

      let change: string | null = null;
      if (parsed.data.method === "cash" && parsed.data.amountTendered !== undefined) {
        change = String(Math.max(0, parsed.data.amountTendered - parsed.data.amount));
      }

      // Step 1: create payment record
      const [newPayment] = await tx
        .insert(paymentsTable)
        .values({
          orderId: parsed.data.orderId,
          amount: String(parsed.data.amount),
          method: parsed.data.method,
          status: "approved",
          change,
        })
        .returning();

      // Step 2: close the order and record when it was paid
      await tx
        .update(ordersTable)
        .set({ status: "closed", paidAt: new Date() })
        .where(eq(ordersTable.id, parsed.data.orderId));

      // Step 3: release the table if linked
      if (order.tableId) {
        await tx
          .update(tablesTable)
          .set({ status: "available", currentOrderId: null })
          .where(eq(tablesTable.id, order.tableId));
      }

      // Step 4: register in open cash register with idempotency guard
      const [openRegister] = await tx
        .select({ id: cashRegistersTable.id })
        .from(cashRegistersTable)
        .where(eq(cashRegistersTable.status, "open"))
        .orderBy(sql`${cashRegistersTable.openedAt} DESC`)
        .limit(1);

      if (openRegister) {
        const [existingMovement] = await tx
          .select({ id: cashMovementsTable.id })
          .from(cashMovementsTable)
          .where(
            and(
              eq(cashMovementsTable.orderId, parsed.data.orderId),
              eq(cashMovementsTable.type, "payment")
            )
          )
          .limit(1);

        if (!existingMovement) {
          await tx.insert(cashMovementsTable).values({
            cashRegisterId: openRegister.id,
            type: "payment",
            amount: String(parsed.data.amount),
            paymentMethod: parsed.data.method,
            reason: `Pagamento Pedido #${parsed.data.orderId}`,
            orderId: parsed.data.orderId,
          });
        }
      }

      return newPayment!;
    });
  } catch (err) {
    if (err && typeof err === "object" && (err as { alreadyPaid?: boolean }).alreadyPaid) {
      res.status(409).json({ error: "Este pedido já foi pago/finalizado." });
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
    })
    .from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.id, params.data.orderId));

  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
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
      change: payment.change !== null ? parseFloat(String(payment.change)) : null,
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
