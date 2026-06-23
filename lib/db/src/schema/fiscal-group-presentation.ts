import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { fiscalGroupsTable } from "./fiscal";
import { storesTable } from "./tenancy";

export const fiscalGroupPresentationTable = pgTable(
  "fiscal_group_presentation",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    fiscalGroupId: integer("fiscal_group_id").notNull().references(() => fiscalGroupsTable.id),
    documentDescription: text("document_description"),
    allowAggregation: boolean("allow_aggregation").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("fiscal_group_presentation_store_idx").on(table.storeId),
    uniqueIndex("fiscal_group_presentation_group_unique").on(table.storeId, table.fiscalGroupId),
  ],
);
