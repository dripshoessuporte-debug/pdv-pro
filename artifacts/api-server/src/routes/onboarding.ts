import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, ilike } from "drizzle-orm";
import {
  categoriesTable,
  db,
  productsTable,
  storeMembersTable,
  storeSettingsTable,
  storesTable,
  tablesTable,
  userEntitlementsTable,
} from "@workspace/db";
import {
  buildAuthenticatedContext,
  resolveAuthenticatedContext,
  setSessionCookie,
} from "../lib/auth";
import { getOrCreateSettings } from "./settings";

const router: IRouter = Router();

type CreateStoreBody = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  cep?: unknown;
  address?: unknown;
  number?: unknown;
  neighborhood?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  complement?: unknown;
  tradeName?: unknown;
};

const requiredFields = [
  "name",
  "phone",
  "email",
  "cep",
  "address",
  "number",
  "neighborhood",
  "city",
  "state",
] as const;

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function createUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "loja";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const slug = `${base}${suffix}`.slice(0, 64);
    const [existing] = await db
      .select({ id: storesTable.id })
      .from(storesTable)
      .where(eq(storesTable.slug, slug))
      .limit(1);

    if (!existing) return slug;
  }

  return `${base}-${Date.now()}`.slice(0, 64);
}

function normalizeCepDigits(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

function normalizeUf(value: unknown): string {
  const uf = String(value ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? uf : "";
}

function normalizeMoney(value: unknown): string | null {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : null;
}

function normalizePositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getMaxControlContext(req: Request, res: Response) {
  const context = await resolveAuthenticatedContext(req);
  if (!context) {
    res.status(401).json({ error: "Autenticação necessária." });
    return null;
  }
  if (context.platformRole && !context.currentStore) {
    res.status(403).json({ error: "Admin Max não usa onboarding da loja." });
    return null;
  }
  if (!context.currentStore) {
    res.status(400).json({ error: "Crie ou selecione uma loja antes." });
    return null;
  }
  if (context.currentStore.role !== "max_control") {
    res.status(403).json({ error: "Somente Max Control pode editar onboarding." });
    return null;
  }
  return context;
}

async function createOwnStoreHandler(req: Request, res: Response) {
  const context = await resolveAuthenticatedContext(req);
  if (!context) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  if (context.platformRole) {
    res.status(403).json({
      error: "Administradores da plataforma não podem criar lojas por este fluxo.",
    });
    return;
  }

  const body = (req.body ?? {}) as CreateStoreBody;
  const missingFields = requiredFields.filter(
    (field) => !asTrimmedString(body[field]),
  );
  if (missingFields.length > 0) {
    res.status(400).json({
      error: "Preencha todos os campos obrigatórios.",
      fields: missingFields,
    });
    return;
  }

  const existingMembership = await db
    .select({ id: storeMembersTable.id })
    .from(storeMembersTable)
    .innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id))
    .where(
      and(
        eq(storeMembersTable.userId, context.user.id),
        eq(storeMembersTable.active, true),
        eq(storesTable.status, "active"),
      ),
    )
    .limit(1);

  if (existingMembership.length > 0) {
    res.status(409).json({
      error: "Este usuário já possui uma loja vinculada.",
    });
    return;
  }

  const [entitlement] = await db
    .select({ status: userEntitlementsTable.status })
    .from(userEntitlementsTable)
    .where(eq(userEntitlementsTable.userId, context.user.id))
    .limit(1);

  if (!entitlement || !["active", "trialing"].includes(entitlement.status)) {
    res.status(403).json({
      error: "Para criar sua loja, escolha um plano ou solicite liberação de teste.",
    });
    return;
  }

  const name = asTrimmedString(body.name);
  const slug = await createUniqueSlug(name);
  const country = asTrimmedString(body.country) || "Brasil";
  const complement = asTrimmedString(body.complement);
  const storeAddress = complement
    ? `${asTrimmedString(body.address)}, ${complement}`
    : asTrimmedString(body.address);

  const [createdStore] = await db.transaction(async (tx) => {
    const [store] = await tx
      .insert(storesTable)
      .values({ name, slug, status: "active" })
      .returning();

    await tx.insert(storeSettingsTable).values({
      storeId: store.id,
      storeName: asTrimmedString(body.tradeName) || name,
      storePhone: asTrimmedString(body.phone),
      storeEmail: asTrimmedString(body.email),
      storeCep: asTrimmedString(body.cep),
      storeAddress,
      storeNumber: asTrimmedString(body.number),
      storeNeighborhood: asTrimmedString(body.neighborhood),
      storeCity: asTrimmedString(body.city),
      storeState: asTrimmedString(body.state),
      storeCountry: country,
      deliveryDispatchTimeMinutes: 25,
      maxOrdersPerRoute: 5,
      routeGroupingMode: "hybrid",
      deliveryFeeMode: "distance_tier",
      baseDeliveryFee: "7.00",
      baseDeliveryDistanceKm: "3.00",
      additionalPricePerKm: "2.00",
      distanceProvider: "approximate_cep",
      useDistanceCache: "true",
      onboardingCompleted: false,
      onboardingStep: "store-info",
    });

    await tx.insert(storeMembersTable).values({
      storeId: store.id,
      userId: context.user.id,
      role: "max_control",
      isDefault: true,
      active: true,
    });

    return [store];
  });

  const nextContext = await buildAuthenticatedContext(
    context.user.id,
    createdStore.id,
  );
  if (!nextContext) {
    res.status(500).json({
      error: "Loja criada, mas não foi possível atualizar a sessão.",
    });
    return;
  }

  setSessionCookie(
    res,
    nextContext.user.id,
    nextContext.currentStore?.id ?? null,
  );
  res.status(201).json({
    user: nextContext.user,
    platformRole: nextContext.platformRole,
    stores: nextContext.stores,
    currentStore: nextContext.currentStore,
  });
}

router.get("/onboarding/status", async (req, res): Promise<void> => {
  const context = await resolveAuthenticatedContext(req);
  if (!context) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }
  if (context.platformRole && !context.currentStore) {
    res.json({ applies: false, completed: true, currentStep: null });
    return;
  }
  if (!context.currentStore || context.currentStore.role !== "max_control") {
    res.json({ applies: false, completed: true, currentStep: null });
    return;
  }

  const currentStore = context.currentStore;
  if (!currentStore) return;
  const storeId = currentStore.id;
  const settings = await getOrCreateSettings(storeId);
  res.json({
    applies: true,
    completed: settings.onboardingCompleted,
    currentStep: settings.onboardingStep ?? "store-info",
    completedAt: settings.onboardingCompletedAt?.toISOString() ?? null,
    settings,
  });
});

router.patch("/onboarding/store-info", async (req, res): Promise<void> => {
  const context = await getMaxControlContext(req, res);
  if (!context) return;
  const currentStore = context.currentStore;
  if (!currentStore) return;
  const storeId = currentStore.id;
  const { storeName, storePhone, storeEmail, storeCep, storeAddress, storeNumber, storeNeighborhood, storeCity, storeState } = req.body ?? {};
  const required = [storeName, storePhone, storeEmail, storeCep, storeAddress, storeNumber, storeNeighborhood, storeCity, storeState];
  if (required.some((value) => !asTrimmedString(value))) {
    res.status(400).json({ error: "Preencha os dados básicos da loja." });
    return;
  }
  const [updated] = await db.update(storeSettingsTable).set({
    storeName: asTrimmedString(storeName),
    storePhone: asTrimmedString(storePhone),
    storeEmail: asTrimmedString(storeEmail),
    storeCep: normalizeCepDigits(storeCep),
    storeAddress: asTrimmedString(storeAddress),
    storeNumber: asTrimmedString(storeNumber),
    storeNeighborhood: asTrimmedString(storeNeighborhood),
    storeCity: asTrimmedString(storeCity),
    storeState: normalizeUf(storeState),
    onboardingStep: "delivery",
  }).where(eq(storeSettingsTable.storeId, storeId)).returning();
  res.json(updated);
});

router.patch("/onboarding/delivery", async (req, res): Promise<void> => {
  const context = await getMaxControlContext(req, res);
  if (!context) return;
  const currentStore = context.currentStore;
  if (!currentStore) return;
  const storeId = currentStore.id;
  const dispatchTime = normalizePositiveInt(req.body?.deliveryDispatchTimeMinutes) ?? 25;
  const [updated] = await db.update(storeSettingsTable).set({
    usesDelivery: Boolean(req.body?.usesDelivery),
    storeCep: req.body?.originCep ? normalizeCepDigits(req.body.originCep) : undefined,
    baseDeliveryFee: normalizeMoney(req.body?.baseDeliveryFee) ?? "0.00",
    baseDeliveryDistanceKm: normalizeMoney(req.body?.baseDeliveryDistanceKm) ?? "0.00",
    additionalPricePerKm: normalizeMoney(req.body?.additionalPricePerKm) ?? "0.00",
    deliveryDispatchTimeMinutes: Math.min(dispatchTime, 180),
    deliveryFeeMode: "distance_tier",
    onboardingStep: "payments",
  }).where(eq(storeSettingsTable.storeId, storeId)).returning();
  res.json(updated);
});

router.patch("/onboarding/payments", async (req, res): Promise<void> => {
  const context = await getMaxControlContext(req, res);
  if (!context) return;
  const currentStore = context.currentStore;
  if (!currentStore) return;
  const storeId = currentStore.id;
  const [updated] = await db.update(storeSettingsTable).set({
    acceptsCash: Boolean(req.body?.acceptsCash),
    acceptsCard: Boolean(req.body?.acceptsCard),
    acceptsPix: Boolean(req.body?.acceptsPix),
    acceptsOnlinePayment: false,
    onboardingStep: "menu",
  }).where(eq(storeSettingsTable.storeId, storeId)).returning();
  res.json(updated);
});

router.post("/onboarding/quick-product", async (req, res): Promise<void> => {
  const context = await getMaxControlContext(req, res);
  if (!context) return;
  const currentStore = context.currentStore;
  if (!currentStore) return;
  const storeId = currentStore.id;
  const name = asTrimmedString(req.body?.name);
  const categoryName = asTrimmedString(req.body?.category);
  const price = normalizeMoney(req.body?.price);
  if (!name || !categoryName || !price) {
    res.status(400).json({ error: "Informe nome, preço e categoria." });
    return;
  }
  const [existingCategory] = await db.select().from(categoriesTable).where(and(eq(categoriesTable.storeId, storeId), ilike(categoriesTable.name, categoryName))).limit(1);
  const category = existingCategory ?? (await db.insert(categoriesTable).values({ storeId: storeId, name: categoryName }).returning())[0];
  const [product] = await db.insert(productsTable).values({ storeId: storeId, categoryId: category.id, name, price }).returning();
  await db.update(storeSettingsTable).set({ onboardingStep: "tables" }).where(eq(storeSettingsTable.storeId, storeId));
  res.status(201).json(product);
});

router.post("/onboarding/tables", async (req, res): Promise<void> => {
  const context = await getMaxControlContext(req, res);
  if (!context) return;
  const currentStore = context.currentStore;
  if (!currentStore) return;
  const storeId = currentStore.id;
  const usesTables = Boolean(req.body?.usesTables);
  const quantity = usesTables ? Math.min(normalizePositiveInt(req.body?.quantity) ?? 0, 200) : 0;
  let created = 0;
  if (quantity > 0) {
    const existing = await db.select({ number: tablesTable.number }).from(tablesTable).where(eq(tablesTable.storeId, storeId));
    const existingNumbers = new Set(existing.map((table) => table.number));
    const values = Array.from({ length: quantity }, (_, index) => index + 1)
      .filter((number) => !existingNumbers.has(number))
      .map((number) => ({ storeId: storeId, number, capacity: 4 }));
    if (values.length > 0) {
      const rows = await db.insert(tablesTable).values(values).returning();
      created = rows.length;
    }
  }
  await db.update(storeSettingsTable).set({ usesTables, onboardingStep: "team" }).where(eq(storeSettingsTable.storeId, storeId));
  res.status(201).json({ created });
});

router.post("/onboarding/complete", async (req, res): Promise<void> => {
  const context = await getMaxControlContext(req, res);
  if (!context) return;
  const currentStore = context.currentStore;
  if (!currentStore) return;
  const storeId = currentStore.id;
  const [updated] = await db.update(storeSettingsTable).set({
    onboardingCompleted: true,
    onboardingStep: "completed",
    onboardingCompletedAt: new Date(),
  }).where(eq(storeSettingsTable.storeId, storeId)).returning();
  res.json(updated);
});

router.post("/onboarding/store", createOwnStoreHandler);
router.post("/stores/create-own-store", createOwnStoreHandler);

export default router;
