import { Router, type IRouter } from "express";
import { eq, ilike, and, ne } from "drizzle-orm";
import { db, categoriesTable, productsTable, orderItemsTable } from "@workspace/db";
import {
  CreateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryBody,
  DeleteCategoryParams,
  CreateProductBody,
  GetProductParams,
  UpdateProductParams,
  UpdateProductBody,
  DeleteProductParams,
  ListProductsQueryParams,
  ListCategoriesResponse,
  ListProductsResponse,
  GetProductResponse,
  UpdateProductResponse,
  UpdateCategoryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── Categories ───────────────────────────────────────────────────────────────

router.get("/menu/categories", async (_req, res): Promise<void> => {
  const categories = await db.select().from(categoriesTable).orderBy(categoriesTable.sortOrder, categoriesTable.name);
  res.json(ListCategoriesResponse.parse(categories));
});

router.post("/menu/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const trimmedName = parsed.data.name.trim();

  // Duplicate name check (case-insensitive)
  const [existing] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(ilike(categoriesTable.name, trimmedName))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Já existe uma categoria com esse nome." });
    return;
  }

  const [category] = await db.insert(categoriesTable).values({ ...parsed.data, name: trimmedName }).returning();
  res.status(201).json(category);
});

router.patch("/menu/categories/:id", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Duplicate name check (excluding self)
  if (parsed.data.name) {
    const trimmedName = parsed.data.name.trim();
    const [existing] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(and(ilike(categoriesTable.name, trimmedName), ne(categoriesTable.id, params.data.id)))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Já existe uma categoria com esse nome." });
      return;
    }

    parsed.data.name = trimmedName;
  }

  const [category] = await db.update(categoriesTable).set(parsed.data).where(eq(categoriesTable.id, params.data.id)).returning();
  if (!category) {
    res.status(404).json({ error: "Categoria não encontrada." });
    return;
  }

  res.json(UpdateCategoryResponse.parse(category));
});

router.delete("/menu/categories/:id", async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Check if category has products
  const [hasProduct] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.categoryId, params.data.id))
    .limit(1);

  if (hasProduct) {
    res.status(409).json({ error: "Não é possível excluir uma categoria que possui produtos." });
    return;
  }

  const [category] = await db.delete(categoriesTable).where(eq(categoriesTable.id, params.data.id)).returning();
  if (!category) {
    res.status(404).json({ error: "Categoria não encontrada." });
    return;
  }

  res.sendStatus(204);
});

// ─── Products ─────────────────────────────────────────────────────────────────

const selectProductRow = {
  id: productsTable.id,
  name: productsTable.name,
  description: productsTable.description,
  price: productsTable.price,
  sku: productsTable.sku,
  barcode: productsTable.barcode,
  costPrice: productsTable.costPrice,
  trackStock: productsTable.trackStock,
  allowSaleWithoutStock: productsTable.allowSaleWithoutStock,
  stockQty: productsTable.stockQty,
  stockMinQty: productsTable.stockMinQty,
  unit: productsTable.unit,
  preparationTimeMinutes: productsTable.preparationTimeMinutes,
  imageUrl: productsTable.imageUrl,
  imageStorageKey: productsTable.imageStorageKey,
  imageProvider: productsTable.imageProvider,
  imageAlt: productsTable.imageAlt,
  available: productsTable.available,
  active: productsTable.active,
  categoryId: productsTable.categoryId,
  categoryName: categoriesTable.name,
};

router.get("/menu/products", async (req, res): Promise<void> => {
  const queryParams = ListProductsQueryParams.safeParse(req.query);
  const {
    categoryId,
    search,
    availableOnly,
    includeInactive,
  } = queryParams.success
    ? queryParams.data
    : { categoryId: undefined, search: undefined, availableOnly: undefined, includeInactive: undefined };

  const conditions = [];

  // By default, hide inactive (soft-deleted) products unless explicitly requested
  if (!includeInactive) {
    conditions.push(eq(productsTable.active, true));
  }

  // When ordering, show only available products
  if (availableOnly) {
    conditions.push(eq(productsTable.available, true));
    conditions.push(eq(productsTable.active, true));
  }

  if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));
  if (search) conditions.push(ilike(productsTable.name, `%${search}%`));

  const rows = await db
    .select(selectProductRow)
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(categoriesTable.sortOrder, categoriesTable.name, productsTable.name);

  res.json(ListProductsResponse.parse(rows.map((r) => ({
    ...r,
    price: parseFloat(r.price),
    costPrice: r.costPrice === null ? null : parseFloat(r.costPrice),
    stockQty: r.stockQty === null ? null : parseFloat(r.stockQty),
    stockMinQty: r.stockMinQty === null ? null : parseFloat(r.stockMinQty),
  }))));
});

router.post("/menu/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Category must exist
  const [cat] = await db.select({ id: categoriesTable.id }).from(categoriesTable).where(eq(categoriesTable.id, parsed.data.categoryId)).limit(1);
  if (!cat) {
    res.status(400).json({ error: "Categoria não encontrada." });
    return;
  }

  // Duplicate name within same category check
  const [dup] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(ilike(productsTable.name, parsed.data.name.trim()), eq(productsTable.categoryId, parsed.data.categoryId)))
    .limit(1);

  if (dup) {
    res.status(409).json({ error: "Já existe um produto com esse nome nessa categoria." });
    return;
  }

  const [product] = await db.insert(productsTable).values({
    ...parsed.data,
    name: parsed.data.name.trim(),
    price: String(parsed.data.price),
    costPrice: parsed.data.costPrice === undefined ? undefined : parsed.data.costPrice === null ? null : String(parsed.data.costPrice),
    stockQty: parsed.data.stockQty === undefined ? undefined : parsed.data.stockQty === null ? null : String(parsed.data.stockQty),
    stockMinQty: parsed.data.stockMinQty === undefined ? undefined : parsed.data.stockMinQty === null ? null : String(parsed.data.stockMinQty),
  }).returning();

  const [row] = await db
    .select(selectProductRow)
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, product.id));

  res.status(201).json(GetProductResponse.parse({
    ...row,
    price: parseFloat(row!.price),
    costPrice: row!.costPrice === null ? null : parseFloat(row!.costPrice),
    stockQty: row!.stockQty === null ? null : parseFloat(row!.stockQty),
    stockMinQty: row!.stockMinQty === null ? null : parseFloat(row!.stockMinQty),
  }));
});

router.get("/menu/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select(selectProductRow)
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }

  res.json(GetProductResponse.parse({
    ...row,
    price: parseFloat(row.price),
    costPrice: row.costPrice === null ? null : parseFloat(row.costPrice),
    stockQty: row.stockQty === null ? null : parseFloat(row.stockQty),
    stockMinQty: row.stockMinQty === null ? null : parseFloat(row.stockMinQty),
  }));
});

router.patch("/menu/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Duplicate name check within same category (if name or categoryId is changing)
  if (parsed.data.name) {
    const [current] = await db.select({ categoryId: productsTable.categoryId }).from(productsTable).where(eq(productsTable.id, params.data.id)).limit(1);
    const targetCategoryId = parsed.data.categoryId ?? current?.categoryId;
    if (targetCategoryId) {
      const [dup] = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(
          ilike(productsTable.name, parsed.data.name.trim()),
          eq(productsTable.categoryId, targetCategoryId),
          ne(productsTable.id, params.data.id),
        ))
        .limit(1);

      if (dup) {
        res.status(409).json({ error: "Já existe um produto com esse nome nessa categoria." });
        return;
      }
    }
    parsed.data.name = parsed.data.name.trim();
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);
  if (parsed.data.costPrice !== undefined) updateData.costPrice = parsed.data.costPrice === null ? null : String(parsed.data.costPrice);
  if (parsed.data.stockQty !== undefined) updateData.stockQty = parsed.data.stockQty === null ? null : String(parsed.data.stockQty);
  if (parsed.data.stockMinQty !== undefined) updateData.stockMinQty = parsed.data.stockMinQty === null ? null : String(parsed.data.stockMinQty);

  const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }

  const [row] = await db
    .select(selectProductRow)
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, product.id));

  res.json(UpdateProductResponse.parse({
    ...row,
    price: parseFloat(row!.price),
    costPrice: row!.costPrice === null ? null : parseFloat(row!.costPrice),
    stockQty: row!.stockQty === null ? null : parseFloat(row!.stockQty),
    stockMinQty: row!.stockMinQty === null ? null : parseFloat(row!.stockMinQty),
  }));
});

router.delete("/menu/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Check if product has ever appeared in an order item
  const [soldItem] = await db
    .select({ id: orderItemsTable.id })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.productId, params.data.id))
    .limit(1);

  if (soldItem) {
    // Soft delete: mark inactive + unavailable to preserve history
    const [product] = await db
      .update(productsTable)
      .set({ active: false, available: false })
      .where(eq(productsTable.id, params.data.id))
      .returning();

    if (!product) {
      res.status(404).json({ error: "Produto não encontrado." });
      return;
    }

    // Return 200 with a signal that it was soft-deleted
    res.status(200).json({ softDeleted: true, message: "Produto desativado (já foi vendido)." });
    return;
  }

  // Hard delete if never sold
  const [product] = await db.delete(productsTable).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }

  res.sendStatus(204);
});

export default router;
