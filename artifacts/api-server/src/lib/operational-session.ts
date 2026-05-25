import { isNull } from "drizzle-orm";
import { db, cashRegistersTable } from "@workspace/db";

export async function getOperationalSessionStart(): Promise<Date> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [openRegister] = await db
    .select({ openedAt: cashRegistersTable.openedAt })
    .from(cashRegistersTable)
    .where(isNull(cashRegistersTable.closedAt))
    .orderBy(cashRegistersTable.openedAt)
    .limit(1);

  return openRegister?.openedAt ? new Date(openRegister.openedAt) : todayStart;
}

export async function getOpenRegisterOpenedAt(): Promise<Date | null> {
  const [openRegister] = await db
    .select({ openedAt: cashRegistersTable.openedAt })
    .from(cashRegistersTable)
    .where(isNull(cashRegistersTable.closedAt))
    .orderBy(cashRegistersTable.openedAt)
    .limit(1);

  return openRegister?.openedAt ? new Date(openRegister.openedAt) : null;
}
