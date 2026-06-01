import { Router, type IRouter } from "express";
import { and, eq, ilike, or } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import {
  CreateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  UpdateCustomerBody,
  DeleteCustomerParams,
  ListCustomersQueryParams,
  ListCustomersResponse,
  GetCustomerResponse,
  UpdateCustomerResponse,
} from "@workspace/api-zod";
import { getDefaultStoreIdOrThrow } from "../lib/store-context";

const router: IRouter = Router();

const normalizePhone = (phone?: string | null) => phone?.replace(/\D/g, "") ?? "";

router.get("/customers", async (req, res): Promise<void> => {
  const queryParams = ListCustomersQueryParams.safeParse(req.query);
  const search = queryParams.success ? queryParams.data.search : undefined;

  const storeId = await getDefaultStoreIdOrThrow();

  let customers;
  if (search) {
    customers = await db.select().from(customersTable).where(
      and(
        eq(customersTable.storeId, storeId),
        or(
          ilike(customersTable.name, `%${search}%`),
          ilike(customersTable.phone, `%${search}%`),
          ilike(customersTable.email, `%${search}%`)
        )
      )
    ).orderBy(customersTable.name);
  } else {
    customers = await db.select().from(customersTable).where(eq(customersTable.storeId, storeId)).orderBy(customersTable.name);
  }

  res.json(ListCustomersResponse.parse(customers.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
  }))));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const storeId = await getDefaultStoreIdOrThrow();
  const phoneDigits = normalizePhone(parsed.data.phone);

  if (phoneDigits) {
    const storeCustomers = await db.select().from(customersTable).where(eq(customersTable.storeId, storeId));
    const existing = storeCustomers.find((customer) => normalizePhone(customer.phone) === phoneDigits);

    if (existing) {
      const nextNotes = parsed.data.notes && !existing.notes?.includes(parsed.data.notes)
        ? [existing.notes, parsed.data.notes].filter(Boolean).join("\n")
        : existing.notes;

      const [customer] = await db.update(customersTable).set({
        name: parsed.data.name || existing.name,
        phone: parsed.data.phone ?? existing.phone,
        email: parsed.data.email ?? existing.email,
        notes: nextNotes,
      }).where(and(eq(customersTable.id, existing.id), eq(customersTable.storeId, storeId))).returning();

      res.status(200).json(GetCustomerResponse.parse({ ...customer, createdAt: customer.createdAt.toISOString() }));
      return;
    }
  }

  const [customer] = await db.insert(customersTable).values({ ...parsed.data, storeId }).returning();
  res.status(201).json(GetCustomerResponse.parse({ ...customer, createdAt: customer.createdAt.toISOString() }));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const storeId = await getDefaultStoreIdOrThrow();
  const [customer] = await db.select().from(customersTable).where(and(eq(customersTable.id, params.data.id), eq(customersTable.storeId, storeId)));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json(GetCustomerResponse.parse({ ...customer, createdAt: customer.createdAt.toISOString() }));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const storeId = await getDefaultStoreIdOrThrow();
  const [customer] = await db.update(customersTable).set(parsed.data).where(and(eq(customersTable.id, params.data.id), eq(customersTable.storeId, storeId))).returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json(UpdateCustomerResponse.parse({ ...customer, createdAt: customer.createdAt.toISOString() }));
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const storeId = await getDefaultStoreIdOrThrow();
  const [customer] = await db.delete(customersTable).where(and(eq(customersTable.id, params.data.id), eq(customersTable.storeId, storeId))).returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
