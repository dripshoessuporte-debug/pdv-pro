import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  storeMembersTable,
  storeSettingsTable,
  storesTable,
} from "@workspace/db";
import {
  buildAuthenticatedContext,
  resolveAuthenticatedContext,
  setSessionCookie,
} from "../lib/auth";

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
      deliveryFeeMode: "manual",
      baseDeliveryFee: "7.00",
      baseDeliveryDistanceKm: "3.00",
      additionalPricePerKm: "2.00",
      distanceProvider: "approximate_cep",
      useDistanceCache: "true",
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

router.post("/onboarding/store", createOwnStoreHandler);
router.post("/stores/create-own-store", createOwnStoreHandler);

export default router;
