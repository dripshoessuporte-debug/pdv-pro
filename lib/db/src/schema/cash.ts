import {
  pgTable,
  serial,
  text,
  numeric,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { storesTable, usersTable } from "./tenancy";

export const cashRegistersTable = pgTable(
  "cash_registers",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    operatorUserId: integer("operator_user_id").references(() => usersTable.id),
    operator: text("operator").notNull(),
    openingAmount: numeric("opening_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    status: text("status").notNull().default("open"),
    notes: text("notes"),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closingAmount: numeric("closing_amount", { precision: 10, scale: 2 }),
    closingNotes: text("closing_notes"),
  },
  (table) => [
    index("cash_registers_store_id_idx").on(table.storeId),
    index("cash_registers_operator_user_id_idx").on(table.operatorUserId),
  ],
);

export const cashMovementsTable = pgTable("cash_movements", {
  id: serial("id").primaryKey(),
  cashRegisterId: integer("cash_register_id")
    .notNull()
    .references(() => cashRegistersTable.id),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  reason: text("reason").notNull(),
  orderId: integer("order_id").references(() => ordersTable.id),
  actorUserId: integer("actor_user_id").references(() => usersTable.id),
  actorName: text("actor_name"),
  actorRole: text("actor_role"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCashRegisterSchema = createInsertSchema(
  cashRegistersTable,
).omit({ id: true, openedAt: true });
export type InsertCashRegister = z.infer<typeof insertCashRegisterSchema>;
export type CashRegister = typeof cashRegistersTable.$inferSelect;

export const insertCashMovementSchema = createInsertSchema(
  cashMovementsTable,
).omit({ id: true, createdAt: true });
export type InsertCashMovement = z.infer<typeof insertCashMovementSchema>;
export type CashMovement = typeof cashMovementsTable.$inferSelect;
