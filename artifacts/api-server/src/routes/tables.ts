import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, ordersTable, tablesTable } from "@workspace/db";
import {
  GetTableParams,
  UpdateTableParams,
  UpdateTableBody,
  DeleteTableParams,
  CreateTableBody,
  ListTablesResponse,
  GetTableResponse,
  UpdateTableResponse,
} from "@workspace/api-zod";
import { getDefaultStoreIdOrThrow } from "../lib/store-context";

const router: IRouter = Router();

router.get("/tables", async (req, res): Promise<void> => {
  const storeId = await getDefaultStoreIdOrThrow();
  const tables = await db.select().from(tablesTable).where(eq(tablesTable.storeId, storeId)).orderBy(tablesTable.number);

  const enrichedTables = await Promise.all(tables.map(async (table) => {
    const openOrders = await db
      .select({ id: ordersTable.id, createdAt: ordersTable.createdAt })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.tableId, table.id),
        inArray(ordersTable.status, ["open", "preparing", "ready"])
      ))
      .orderBy(sql`${ordersTable.createdAt} DESC`);

    const currentOrderId = openOrders[0]?.id ?? table.currentOrderId ?? null;
    const status = openOrders.length > 0 ? "occupied" : table.status === "occupied" ? "available" : table.status;

    return {
      ...table,
      status,
      currentOrderId,
      openOrdersCount: openOrders.length,
      hasMultipleOpenOrders: openOrders.length > 1,
      createdAt: table.createdAt.toISOString(),
    };
  }));

  res.json(ListTablesResponse.parse(enrichedTables));
});

router.post("/tables", async (req, res): Promise<void> => {
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const storeId = await getDefaultStoreIdOrThrow();
  const [table] = await db.insert(tablesTable).values({ ...parsed.data, storeId }).returning();
  res.status(201).json(GetTableResponse.parse({ ...table, createdAt: table.createdAt.toISOString() }));
});

router.get("/tables/:id", async (req, res): Promise<void> => {
  const params = GetTableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const storeId = await getDefaultStoreIdOrThrow();
  const [table] = await db.select().from(tablesTable).where(and(eq(tablesTable.id, params.data.id), eq(tablesTable.storeId, storeId)));
  if (!table) {
    res.status(404).json({ error: "Table not found" });
    return;
  }

  res.json(GetTableResponse.parse({ ...table, createdAt: table.createdAt.toISOString() }));
});

router.patch("/tables/:id", async (req, res): Promise<void> => {
  const params = UpdateTableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const storeId = await getDefaultStoreIdOrThrow();
  const [table] = await db.update(tablesTable).set(parsed.data).where(and(eq(tablesTable.id, params.data.id), eq(tablesTable.storeId, storeId))).returning();
  if (!table) {
    res.status(404).json({ error: "Table not found" });
    return;
  }

  res.json(UpdateTableResponse.parse({ ...table, createdAt: table.createdAt.toISOString() }));
});

router.delete("/tables/:id", async (req, res): Promise<void> => {
  const params = DeleteTableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const storeId = await getDefaultStoreIdOrThrow();
  const [table] = await db.delete(tablesTable).where(and(eq(tablesTable.id, params.data.id), eq(tablesTable.storeId, storeId))).returning();
  if (!table) {
    res.status(404).json({ error: "Table not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
