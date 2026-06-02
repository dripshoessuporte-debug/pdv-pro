import { Router, type IRouter } from "express";
import { eq, ilike, and, ne } from "drizzle-orm";
import { getCurrentActor } from "../middleware/rbac";
import {
  db,
  categoriesTable,
  productsTable,
  productVariantsTable,
  orderItemsTable,
  variantTemplatesTable,
  variantTemplateOptionsTable,
} from "@workspace/db";
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

router.get("/menu/categories", async (req, res): Promise<void> => {
  const { storeId } = await getCurrentActor(req);
  const categories = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.storeId, storeId))
    .orderBy(categoriesTable.sortOrder, categoriesTable.name);
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

  const [category] = await db
    .insert(categoriesTable)
    .values({ ...parsed.data, name: trimmedName })
    .returning();
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
      .where(
        and(
          ilike(categoriesTable.name, trimmedName),
          ne(categoriesTable.id, params.data.id),
        ),
      )
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Já existe uma categoria com esse nome." });
      return;
    }

    parsed.data.name = trimmedName;
  }

  const [category] = await db
    .update(categoriesTable)
    .set(parsed.data)
    .where(eq(categoriesTable.id, params.data.id))
    .returning();
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
    res.status(409).json({
      error: "Não é possível excluir uma categoria que possui produtos.",
    });
    return;
  }

  const [category] = await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.id, params.data.id))
    .returning();
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
  const { categoryId, search, availableOnly, includeInactive } =
    queryParams.success
      ? queryParams.data
      : {
          categoryId: undefined,
          search: undefined,
          availableOnly: undefined,
          includeInactive: undefined,
        };

  const { storeId } = await getCurrentActor(req);
  const conditions = [eq(productsTable.storeId, storeId)];

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
    .orderBy(
      categoriesTable.sortOrder,
      categoriesTable.name,
      productsTable.name,
    );

  res.json(
    ListProductsResponse.parse(
      rows.map((r) => ({
        ...r,
        price: parseFloat(r.price),
        costPrice: r.costPrice === null ? null : parseFloat(r.costPrice),
        stockQty: r.stockQty === null ? null : parseFloat(r.stockQty),
        stockMinQty: r.stockMinQty === null ? null : parseFloat(r.stockMinQty),
      })),
    ),
  );
});

router.post("/menu/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Category must exist
  const [cat] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, parsed.data.categoryId))
    .limit(1);
  if (!cat) {
    res.status(400).json({ error: "Categoria não encontrada." });
    return;
  }

  // Duplicate name within same category check
  const [dup] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(
      and(
        ilike(productsTable.name, parsed.data.name.trim()),
        eq(productsTable.categoryId, parsed.data.categoryId),
      ),
    )
    .limit(1);

  if (dup) {
    res
      .status(409)
      .json({ error: "Já existe um produto com esse nome nessa categoria." });
    return;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      ...parsed.data,
      name: parsed.data.name.trim(),
      price: String(parsed.data.price),
      costPrice:
        parsed.data.costPrice === undefined
          ? undefined
          : parsed.data.costPrice === null
            ? null
            : String(parsed.data.costPrice),
      stockQty:
        parsed.data.stockQty === undefined
          ? undefined
          : parsed.data.stockQty === null
            ? null
            : String(parsed.data.stockQty),
      stockMinQty:
        parsed.data.stockMinQty === undefined
          ? undefined
          : parsed.data.stockMinQty === null
            ? null
            : String(parsed.data.stockMinQty),
    })
    .returning();

  const [row] = await db
    .select(selectProductRow)
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, product.id));

  res.status(201).json(
    GetProductResponse.parse({
      ...row,
      price: parseFloat(row!.price),
      costPrice: row!.costPrice === null ? null : parseFloat(row!.costPrice),
      stockQty: row!.stockQty === null ? null : parseFloat(row!.stockQty),
      stockMinQty:
        row!.stockMinQty === null ? null : parseFloat(row!.stockMinQty),
    }),
  );
});

router.get("/menu/products/:id", async (req, res): Promise<void> => {
  const { storeId } = await getCurrentActor(req);
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select(selectProductRow)
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(
      and(
        eq(productsTable.id, params.data.id),
        eq(productsTable.storeId, storeId),
      ),
    );

  if (!row) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }

  res.json(
    GetProductResponse.parse({
      ...row,
      price: parseFloat(row.price),
      costPrice: row.costPrice === null ? null : parseFloat(row.costPrice),
      stockQty: row.stockQty === null ? null : parseFloat(row.stockQty),
      stockMinQty:
        row.stockMinQty === null ? null : parseFloat(row.stockMinQty),
    }),
  );
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
    const [current] = await db
      .select({ categoryId: productsTable.categoryId })
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .limit(1);
    const targetCategoryId = parsed.data.categoryId ?? current?.categoryId;
    if (targetCategoryId) {
      const [dup] = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(
          and(
            ilike(productsTable.name, parsed.data.name.trim()),
            eq(productsTable.categoryId, targetCategoryId),
            ne(productsTable.id, params.data.id),
          ),
        )
        .limit(1);

      if (dup) {
        res.status(409).json({
          error: "Já existe um produto com esse nome nessa categoria.",
        });
        return;
      }
    }
    parsed.data.name = parsed.data.name.trim();
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price !== undefined)
    updateData.price = String(parsed.data.price);
  if (parsed.data.costPrice !== undefined)
    updateData.costPrice =
      parsed.data.costPrice === null ? null : String(parsed.data.costPrice);
  if (parsed.data.stockQty !== undefined)
    updateData.stockQty =
      parsed.data.stockQty === null ? null : String(parsed.data.stockQty);
  if (parsed.data.stockMinQty !== undefined)
    updateData.stockMinQty =
      parsed.data.stockMinQty === null ? null : String(parsed.data.stockMinQty);

  const [product] = await db
    .update(productsTable)
    .set(updateData)
    .where(eq(productsTable.id, params.data.id))
    .returning();
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }

  const [row] = await db
    .select(selectProductRow)
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, product.id));

  res.json(
    UpdateProductResponse.parse({
      ...row,
      price: parseFloat(row!.price),
      costPrice: row!.costPrice === null ? null : parseFloat(row!.costPrice),
      stockQty: row!.stockQty === null ? null : parseFloat(row!.stockQty),
      stockMinQty:
        row!.stockMinQty === null ? null : parseFloat(row!.stockMinQty),
    }),
  );
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
    res.status(200).json({
      softDeleted: true,
      message: "Produto desativado (já foi vendido).",
    });
    return;
  }

  // Hard delete if never sold
  const [product] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .returning();
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }

  res.sendStatus(204);
});

router.get("/menu/products/:id/variants", async (req, res): Promise<void> => {
  const { storeId } = await getCurrentActor(req);
  const params = GetProductParams.safeParse(req.params);
  if (!params.success)
    return void res.status(400).json({ error: params.error.message });
  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, params.data.id),
        eq(productsTable.storeId, storeId),
      ),
    )
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }

  const rows = await db
    .select()
    .from(productVariantsTable)
    .where(
      and(
        eq(productVariantsTable.productId, params.data.id),
        eq(productVariantsTable.storeId, storeId),
      ),
    )
    .orderBy(productVariantsTable.sortOrder, productVariantsTable.id);
  res.json(rows.map((r) => ({ ...r, price: parseFloat(r.price) })));
});

router.post("/menu/products/:id/variants", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success)
    return void res.status(400).json({ error: params.error.message });
  const body = req.body as {
    name?: string;
    price?: number;
    active?: boolean;
    available?: boolean;
    sortOrder?: number;
  };
  if (
    !body?.name?.trim() ||
    typeof body.price !== "number" ||
    !Number.isFinite(body.price) ||
    body.price < 0
  ) {
    return void res.status(400).json({
      error: "Dados da variação inválidos: preço deve ser numérico e >= 0.",
    });
  }
  const [product] = await db
    .select({ id: productsTable.id, storeId: productsTable.storeId })
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .limit(1);
  if (!product)
    return void res.status(404).json({ error: "Produto não encontrado." });
  const [created] = await db
    .insert(productVariantsTable)
    .values({
      productId: product.id,
      storeId: product.storeId,
      name: body.name.trim(),
      price: String(body.price),
      active: body.active ?? true,
      available: body.available ?? true,
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();
  res.status(201).json({ ...created, price: parseFloat(created.price) });
});

router.patch("/menu/product-variants/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return void res.status(400).json({ error: "ID inválido." });
  const parsed = req.body as {
    name?: string;
    price?: number;
    active?: boolean;
    available?: boolean;
    sortOrder?: number;
  };
  if (
    parsed.price !== undefined &&
    (typeof parsed.price !== "number" ||
      !Number.isFinite(parsed.price) ||
      parsed.price < 0)
  ) {
    return void res
      .status(400)
      .json({ error: "Preço da variação inválido: deve ser numérico e >= 0." });
  }
  const data: Record<string, unknown> = { ...parsed };
  if (parsed.name !== undefined) data.name = parsed.name.trim();
  if (parsed.price !== undefined) data.price = String(parsed.price);
  data.updatedAt = new Date();
  const [updated] = await db
    .update(productVariantsTable)
    .set(data)
    .where(eq(productVariantsTable.id, id))
    .returning();
  if (!updated)
    return void res.status(404).json({ error: "Variação não encontrada." });
  res.json({ ...updated, price: parseFloat(updated.price) });
});

router.delete("/menu/product-variants/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return void res.status(400).json({ error: "ID inválido." });
  const [deleted] = await db
    .delete(productVariantsTable)
    .where(eq(productVariantsTable.id, id))
    .returning();
  if (!deleted)
    return void res.status(404).json({ error: "Variação não encontrada." });
  res.sendStatus(204);
});

router.get("/menu/variant-templates", async (req, res): Promise<void> => {
  try {
    const { storeId } = await getCurrentActor(req);
    const rows = await db
      .select()
      .from(variantTemplatesTable)
      .where(eq(variantTemplatesTable.storeId, storeId))
      .orderBy(variantTemplatesTable.name);
    res.json(rows);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Erro ao carregar modelos de variação.",
    });
  }
});

router.post("/menu/variant-templates", async (req, res): Promise<void> => {
  const body = req.body as {
    name?: string;
    description?: string;
    active?: boolean;
  };
  if (!body?.name?.trim())
    return void res.status(400).json({ error: "Nome é obrigatório." });
  try {
    const { storeId } = await getCurrentActor(req);
    const [created] = await db
      .insert(variantTemplatesTable)
      .values({
        storeId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        active: body.active ?? true,
      })
      .returning();
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Erro ao criar modelo de variação.",
    });
  }
});

router.patch("/menu/variant-templates/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return void res.status(400).json({ error: "ID inválido." });
  const body = req.body as {
    name?: string;
    description?: string | null;
    active?: boolean;
  };
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.description !== undefined)
    data.description = body.description?.trim() || null;
  if (body.active !== undefined) data.active = body.active;
  const { storeId } = await getCurrentActor(req);
  const [updated] = await db
    .update(variantTemplatesTable)
    .set(data)
    .where(
      and(
        eq(variantTemplatesTable.id, id),
        eq(variantTemplatesTable.storeId, storeId),
      ),
    )
    .returning();
  if (!updated)
    return void res.status(404).json({ error: "Modelo não encontrado." });
  res.json(updated);
});

router.delete(
  "/menu/variant-templates/:id",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return void res.status(400).json({ error: "ID inválido." });
    const { storeId } = await getCurrentActor(req);
    const [template] = await db
      .select({ id: variantTemplatesTable.id })
      .from(variantTemplatesTable)
      .where(
        and(
          eq(variantTemplatesTable.id, id),
          eq(variantTemplatesTable.storeId, storeId),
        ),
      )
      .limit(1);
    if (!template)
      return void res.status(404).json({ error: "Modelo não encontrado." });
    await db
      .delete(variantTemplateOptionsTable)
      .where(eq(variantTemplateOptionsTable.templateId, id));
    const [deleted] = await db
      .delete(variantTemplatesTable)
      .where(
        and(
          eq(variantTemplatesTable.id, id),
          eq(variantTemplatesTable.storeId, storeId),
        ),
      )
      .returning();
    if (!deleted)
      return void res.status(404).json({ error: "Modelo não encontrado." });
    res.sendStatus(204);
  },
);

router.get(
  "/menu/variant-templates/:id/options",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return void res.status(400).json({ error: "ID inválido." });
    const { storeId } = await getCurrentActor(req);
    const [template] = await db
      .select({ id: variantTemplatesTable.id })
      .from(variantTemplatesTable)
      .where(
        and(
          eq(variantTemplatesTable.id, id),
          eq(variantTemplatesTable.storeId, storeId),
        ),
      )
      .limit(1);
    if (!template)
      return void res.status(404).json({ error: "Modelo não encontrado." });
    const rows = await db
      .select()
      .from(variantTemplateOptionsTable)
      .where(eq(variantTemplateOptionsTable.templateId, id))
      .orderBy(
        variantTemplateOptionsTable.sortOrder,
        variantTemplateOptionsTable.id,
      );
    res.json(rows.map((r) => ({ ...r, price: parseFloat(r.price) })));
  },
);

router.post(
  "/menu/variant-templates/:id/options",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const body = req.body as {
      name?: string;
      price?: number;
      available?: boolean;
      sortOrder?: number;
    };
    if (
      !Number.isInteger(id) ||
      !body?.name?.trim() ||
      typeof body.price !== "number" ||
      body.price < 0 ||
      !Number.isFinite(body.price)
    )
      return void res.status(400).json({ error: "Dados inválidos." });
    const { storeId } = await getCurrentActor(req);
    const [template] = await db
      .select({ id: variantTemplatesTable.id })
      .from(variantTemplatesTable)
      .where(
        and(
          eq(variantTemplatesTable.id, id),
          eq(variantTemplatesTable.storeId, storeId),
        ),
      )
      .limit(1);
    if (!template)
      return void res.status(404).json({ error: "Modelo não encontrado." });
    const [created] = await db
      .insert(variantTemplateOptionsTable)
      .values({
        templateId: id,
        name: body.name.trim(),
        price: String(body.price),
        available: body.available ?? true,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();
    res.status(201).json({ ...created, price: parseFloat(created.price) });
  },
);

router.patch(
  "/menu/variant-template-options/:id",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return void res.status(400).json({ error: "ID inválido." });
    const body = req.body as {
      name?: string;
      price?: number;
      available?: boolean;
      sortOrder?: number;
    };
    if (
      body.price !== undefined &&
      (typeof body.price !== "number" ||
        body.price < 0 ||
        !Number.isFinite(body.price))
    )
      return void res.status(400).json({ error: "Preço inválido." });
    const { storeId } = await getCurrentActor(req);
    const [optionRow] = await db
      .select({
        id: variantTemplateOptionsTable.id,
        templateId: variantTemplateOptionsTable.templateId,
      })
      .from(variantTemplateOptionsTable)
      .where(eq(variantTemplateOptionsTable.id, id))
      .limit(1);
    if (!optionRow)
      return void res.status(404).json({ error: "Opção não encontrada." });
    const [template] = await db
      .select({ id: variantTemplatesTable.id })
      .from(variantTemplatesTable)
      .where(
        and(
          eq(variantTemplatesTable.id, optionRow.templateId),
          eq(variantTemplatesTable.storeId, storeId),
        ),
      )
      .limit(1);
    if (!template)
      return void res.status(404).json({ error: "Opção não encontrada." });
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.price !== undefined) data.price = String(body.price);
    if (body.available !== undefined) data.available = body.available;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    const [updated] = await db
      .update(variantTemplateOptionsTable)
      .set(data)
      .where(eq(variantTemplateOptionsTable.id, id))
      .returning();
    res.json({ ...updated, price: parseFloat(updated.price) });
  },
);

router.delete(
  "/menu/variant-template-options/:id",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return void res.status(400).json({ error: "ID inválido." });
    const { storeId } = await getCurrentActor(req);
    const [optionRow] = await db
      .select({
        id: variantTemplateOptionsTable.id,
        templateId: variantTemplateOptionsTable.templateId,
      })
      .from(variantTemplateOptionsTable)
      .where(eq(variantTemplateOptionsTable.id, id))
      .limit(1);
    if (!optionRow)
      return void res.status(404).json({ error: "Opção não encontrada." });
    const [template] = await db
      .select({ id: variantTemplatesTable.id })
      .from(variantTemplatesTable)
      .where(
        and(
          eq(variantTemplatesTable.id, optionRow.templateId),
          eq(variantTemplatesTable.storeId, storeId),
        ),
      )
      .limit(1);
    if (!template)
      return void res.status(404).json({ error: "Opção não encontrada." });
    const [deleted] = await db
      .delete(variantTemplateOptionsTable)
      .where(eq(variantTemplateOptionsTable.id, id))
      .returning();
    if (!deleted)
      return void res.status(404).json({ error: "Opção não encontrada." });
    res.sendStatus(204);
  },
);

router.post(
  "/menu/products/:id/apply-variant-template",
  async (req, res): Promise<void> => {
    const productId = Number(req.params.id);
    const templateId = Number((req.body as { templateId?: number }).templateId);
    if (!Number.isInteger(productId) || !Number.isInteger(templateId))
      return void res.status(400).json({ error: "IDs inválidos." });
    const [product] = await db
      .select({ id: productsTable.id, storeId: productsTable.storeId })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (!product)
      return void res.status(404).json({ error: "Produto não encontrado." });
    const [template] = await db
      .select({
        id: variantTemplatesTable.id,
        active: variantTemplatesTable.active,
        storeId: variantTemplatesTable.storeId,
      })
      .from(variantTemplatesTable)
      .where(eq(variantTemplatesTable.id, templateId))
      .limit(1);
    if (!template || !template.active)
      return void res
        .status(404)
        .json({ error: "Modelo não encontrado ou inativo." });
    if (template.storeId !== product.storeId)
      return void res
        .status(409)
        .json({ error: "Modelo e produto precisam pertencer à mesma loja." });
    const options = await db
      .select()
      .from(variantTemplateOptionsTable)
      .where(
        and(
          eq(variantTemplateOptionsTable.templateId, templateId),
          eq(variantTemplateOptionsTable.available, true),
        ),
      )
      .orderBy(
        variantTemplateOptionsTable.sortOrder,
        variantTemplateOptionsTable.id,
      );
    const created = options.length
      ? await db
          .insert(productVariantsTable)
          .values(
            options.map((opt) => ({
              productId: product.id,
              storeId: product.storeId,
              name: opt.name,
              price: opt.price,
              active: true,
              available: opt.available,
              sortOrder: opt.sortOrder,
            })),
          )
          .returning()
      : [];
    res
      .status(201)
      .json(created.map((r) => ({ ...r, price: parseFloat(r.price) })));
  },
);

export default router;
