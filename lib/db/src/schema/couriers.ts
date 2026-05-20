import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const couriersTable = pgTable("couriers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  vehicle: text("vehicle").notNull().default("moto"),
  active: text("active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
