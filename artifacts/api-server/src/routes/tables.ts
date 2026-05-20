import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tablesTable } from "@workspace/db";
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

const router: IRouter = Router();

router.get("/tables", async (req, res): Promise<void> => {
  const tables = await db.select().from(tablesTable).orderBy(tablesTable.number);
  res.json(ListTablesResponse.parse(tables.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
  }))));
});

router.post("/tables", async (req, res): Promise<void> => {
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [table] = await db.insert(tablesTable).values(parsed.data).returning();
  res.status(201).json(GetTableResponse.parse({ ...table, createdAt: table.createdAt.toISOString() }));
});

router.get("/tables/:id", async (req, res): Promise<void> => {
  const params = GetTableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [table] = await db.select().from(tablesTable).where(eq(tablesTable.id, params.data.id));
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

  const [table] = await db.update(tablesTable).set(parsed.data).where(eq(tablesTable.id, params.data.id)).returning();
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

  const [table] = await db.delete(tablesTable).where(eq(tablesTable.id, params.data.id)).returning();
  if (!table) {
    res.status(404).json({ error: "Table not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
