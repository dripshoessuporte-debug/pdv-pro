import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, ordersTable, tablesTable, orderItemsTable, productsTable, customersTable } from "@workspace/db";
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

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  let change: string | null = null;
  if (parsed.data.method === "cash" && parsed.data.amountTendered !== undefined) {
    const changeVal = parsed.data.amountTendered - parsed.data.amount;
    change = String(Math.max(0, changeVal));
  }

  const [payment] = await db.insert(paymentsTable).values({
    orderId: parsed.data.orderId,
    amount: String(parsed.data.amount),
    method: parsed.data.method,
    status: "approved",
    change,
  }).returning();

  // Close the order and free the table
  await db.update(ordersTable).set({ status: "closed" }).where(eq(ordersTable.id, parsed.data.orderId));
  if (order.tableId) {
    await db.update(tablesTable)
      .set({ status: "available", currentOrderId: null })
      .where(eq(tablesTable.id, order.tableId));
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
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, params.data.orderId));
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
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
