import { eq, sql } from "drizzle-orm";
import { db, ordersTable, paymentsTable } from "@workspace/db";

export type PaymentState = "unpaid" | "partial" | "paid" | "overpaid";

export type OrderFinancialState = {
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentState: PaymentState;
};

export async function getOrderFinancialState(
  orderId: number,
  client: Pick<typeof db, "select"> = db,
): Promise<OrderFinancialState> {
  const [order] = await client
    .select({ totalAmount: ordersTable.totalAmount })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  const [paid] = await client
    .select({
      paidAmount: sql<string>`coalesce(sum(${paymentsTable.amount}), 0)`,
    })
    .from(paymentsTable)
    .where(
      sql`${paymentsTable.orderId} = ${orderId} and ${paymentsTable.status} = 'approved'`,
    );

  const totalAmount = Number.parseFloat(String(order?.totalAmount ?? "0"));
  const paidAmount = Number.parseFloat(String(paid?.paidAmount ?? "0"));
  const outstandingAmount = Math.max(0, totalAmount - paidAmount);
  const paymentState: PaymentState =
    paidAmount === 0
      ? "unpaid"
      : paidAmount > totalAmount
        ? "overpaid"
        : paidAmount >= totalAmount
          ? "paid"
          : "partial";

  return { totalAmount, paidAmount, outstandingAmount, paymentState };
}
