import { and, eq, isNull } from "drizzle-orm";
import { db, cashRegistersTable } from "@workspace/db";

export async function getOperationalSessionStart(
  storeId?: number,
): Promise<Date> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [openRegister] = await db
    .select({ openedAt: cashRegistersTable.openedAt })
    .from(cashRegistersTable)
    .where(
      storeId
        ? and(
            isNull(cashRegistersTable.closedAt),
            eq(cashRegistersTable.storeId, storeId),
          )
        : isNull(cashRegistersTable.closedAt),
    )
    .orderBy(cashRegistersTable.openedAt)
    .limit(1);

  return openRegister?.openedAt ? new Date(openRegister.openedAt) : todayStart;
}

export async function getOpenRegisterOpenedAt(
  storeId?: number,
): Promise<Date | null> {
  const [openRegister] = await db
    .select({ openedAt: cashRegistersTable.openedAt })
    .from(cashRegistersTable)
    .where(
      storeId
        ? and(
            isNull(cashRegistersTable.closedAt),
            eq(cashRegistersTable.storeId, storeId),
          )
        : isNull(cashRegistersTable.closedAt),
    )
    .orderBy(cashRegistersTable.openedAt)
    .limit(1);

  return openRegister?.openedAt ? new Date(openRegister.openedAt) : null;
}
