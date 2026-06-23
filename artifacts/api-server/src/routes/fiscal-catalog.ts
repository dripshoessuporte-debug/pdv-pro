import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  categoriesTable,
  db,
  fiscalAuditLogsTable,
  fiscalGroupPresentationTable,
  fiscalGroupRulesTable,
  fiscalGroupsTable,
  productFiscalSettingsTable,
  productsTable,
  storeFiscalPresentationTable,
  storeFiscalSettingsTable,
} from "@workspace/db";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";

const router: IRouter = Router();

const clean = (value: unknown, maxLength = 180): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";
const digits = (value: unknown): string => clean(value, 40).replace(/\D/g, "");

const suggestedGroups = [
  {
    name: "Pizzas e refeições",
    description: "Alimentos preparados e refeições vendidas pela loja.",
    documentDescription: "Refeição",
  },
  {
    name: "Bebidas",
    description: "Refrigerantes, sucos, águas e outras bebidas.",
    documentDescription: "Bebida",
  },
  {
    name: "Sobremesas",
    description: "Doces, sobremesas e produtos semelhantes.",
    documentDescription: "Sobremesa",
  },
  {
    name: "Adicionais",
    description: "Bordas, complementos e adicionais cobrados separadamente.",
    documentDescription: "Adicional",
  },
  {
    name: "Combos",
    description: "Combinações comerciais que ainda precisam de validação fiscal.",
    documentDescription: "Combo",
  },
] as const;

type GroupPayload = {
  name: string;
  description: string;
  documentDescription: string;
  allowAggregation: boolean;
  ncm: string;
  cest: string;
  cfop: string;
  commercialUnit: string;
  origin: string;
  icmsCode: string;
  pisCode: string;
  cofinsCode: string;
  natureOperation: string;
};

function normalizeGroupPayload(body: unknown): GroupPayload {
  const source = (body ?? {}) as Record<string, unknown>;
  return {
    name: clean(source.name, 100),
    description: clean(source.description, 300),
    documentDescription: clean(source.documentDescription, 120),
    allowAggregation: source.allowAggregation !== false,
    ncm: digits(source.ncm).slice(0, 8),
    cest: digits(source.cest).slice(0, 7),
    cfop: digits(source.cfop).slice(0, 4),
    commercialUnit: clean(source.commercialUnit, 10).toUpperCase(),
    origin: digits(source.origin).slice(0, 1),
    icmsCode: digits(source.icmsCode).slice(0, 3),
    pisCode: digits(source.pisCode).slice(0, 2),
    cofinsCode: digits(source.cofinsCode).slice(0, 2),
    natureOperation: clean(source.natureOperation, 120),
  };
}

function validateGroupPayload(payload: GroupPayload): Array<{
  field: keyof GroupPayload;
  message: string;
}> {
  const errors: Array<{ field: keyof GroupPayload; message: string }> = [];

  if (!payload.name) {
    errors.push({ field: "name", message: "Informe o nome do grupo fiscal." });
  }
  if (payload.ncm && !/^\d{8}$/.test(payload.ncm)) {
    errors.push({ field: "ncm", message: "O NCM deve possuir 8 dígitos." });
  }
  if (payload.cest && !/^\d{7}$/.test(payload.cest)) {
    errors.push({ field: "cest", message: "O CEST deve possuir 7 dígitos." });
  }
  if (payload.cfop && !/^\d{4}$/.test(payload.cfop)) {
    errors.push({ field: "cfop", message: "O CFOP deve possuir 4 dígitos." });
  }
  if (payload.origin && !/^[0-8]$/.test(payload.origin)) {
    errors.push({ field: "origin", message: "A origem deve ser um código entre 0 e 8." });
  }
  if (payload.icmsCode && !/^\d{2,3}$/.test(payload.icmsCode)) {
    errors.push({ field: "icmsCode", message: "Informe um CST ou CSOSN com 2 ou 3 dígitos." });
  }
  if (payload.pisCode && !/^\d{2}$/.test(payload.pisCode)) {
    errors.push({ field: "pisCode", message: "O CST de PIS deve possuir 2 dígitos." });
  }
  if (payload.cofinsCode && !/^\d{2}$/.test(payload.cofinsCode)) {
    errors.push({ field: "cofinsCode", message: "O CST de COFINS deve possuir 2 dígitos." });
  }

  return errors;
}

function missingGroupFields(
  group: {
    documentDescription: string | null;
    ncm: string | null;
    cfop: string | null;
    commercialUnit: string | null;
    origin: string | null;
    icmsCode: string | null;
    pisCode: string | null;
    cofinsCode: string | null;
  },
  itemizationMode: string,
): string[] {
  const missing: string[] = [];
  if (itemizationMode === "simplified" && !group.documentDescription) {
    missing.push("Descrição na NFC-e");
  }
  if (!group.ncm) missing.push("NCM");
  if (!group.cfop) missing.push("CFOP");
  if (!group.commercialUnit) missing.push("Unidade comercial");
  if (!group.origin) missing.push("Origem");
  if (!group.icmsCode) missing.push("CST/CSOSN");
  if (!group.pisCode) missing.push("PIS");
  if (!group.cofinsCode) missing.push("COFINS");
  return missing;
}

async function requireInitialFiscalSettings(storeId: number): Promise<void> {
  const [settings] = await db
    .select({ id: storeFiscalSettingsTable.id })
    .from(storeFiscalSettingsTable)
    .where(eq(storeFiscalSettingsTable.storeId, storeId))
    .limit(1);

  if (!settings) {
    const error = new Error("Conclua primeiro a configuração inicial da empresa.") as Error & {
      status?: number;
      code?: string;
    };
    error.status = 409;
    error.code = "FISCAL_INITIAL_SETUP_REQUIRED";
    throw error;
  }
}

async function ensureGroupBelongsToStore(storeId: number, groupId: number) {
  const [group] = await db
    .select({ id: fiscalGroupsTable.id, active: fiscalGroupsTable.active })
    .from(fiscalGroupsTable)
    .where(and(eq(fiscalGroupsTable.id, groupId), eq(fiscalGroupsTable.storeId, storeId)))
    .limit(1);
  return group ?? null;
}

async function readCatalog(storeId: number) {
  const [presentation] = await db
    .select({ mode: storeFiscalPresentationTable.mode })
    .from(storeFiscalPresentationTable)
    .where(eq(storeFiscalPresentationTable.storeId, storeId))
    .limit(1);
  const itemizationMode = presentation?.mode ?? "simplified";

  const groupRows = await db
    .select({
      id: fiscalGroupsTable.id,
      name: fiscalGroupsTable.name,
      description: fiscalGroupsTable.description,
      active: fiscalGroupsTable.active,
      documentDescription: fiscalGroupPresentationTable.documentDescription,
      allowAggregation: fiscalGroupPresentationTable.allowAggregation,
      ncm: fiscalGroupRulesTable.ncm,
      cest: fiscalGroupRulesTable.cest,
      cfop: fiscalGroupRulesTable.cfop,
      commercialUnit: fiscalGroupRulesTable.commercialUnit,
      origin: fiscalGroupRulesTable.origin,
      icmsCode: fiscalGroupRulesTable.icmsCode,
      pisCode: fiscalGroupRulesTable.pisCode,
      cofinsCode: fiscalGroupRulesTable.cofinsCode,
      natureOperation: fiscalGroupRulesTable.natureOperation,
    })
    .from(fiscalGroupsTable)
    .leftJoin(
      fiscalGroupRulesTable,
      and(
        eq(fiscalGroupRulesTable.fiscalGroupId, fiscalGroupsTable.id),
        eq(fiscalGroupRulesTable.storeId, storeId),
      ),
    )
    .leftJoin(
      fiscalGroupPresentationTable,
      and(
        eq(fiscalGroupPresentationTable.fiscalGroupId, fiscalGroupsTable.id),
        eq(fiscalGroupPresentationTable.storeId, storeId),
      ),
    )
    .where(eq(fiscalGroupsTable.storeId, storeId))
    .orderBy(fiscalGroupsTable.name);

  const productRows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      active: productsTable.active,
      available: productsTable.available,
      categoryName: categoriesTable.name,
      fiscalGroupId: productFiscalSettingsTable.fiscalGroupId,
    })
    .from(productsTable)
    .innerJoin(
      categoriesTable,
      and(eq(categoriesTable.id, productsTable.categoryId), eq(categoriesTable.storeId, storeId)),
    )
    .leftJoin(
      productFiscalSettingsTable,
      and(
        eq(productFiscalSettingsTable.productId, productsTable.id),
        eq(productFiscalSettingsTable.storeId, storeId),
      ),
    )
    .where(eq(productsTable.storeId, storeId))
    .orderBy(categoriesTable.name, productsTable.name);

  const productCounts = new Map<number, number>();
  for (const product of productRows) {
    if (product.fiscalGroupId) {
      productCounts.set(
        product.fiscalGroupId,
        (productCounts.get(product.fiscalGroupId) ?? 0) + 1,
      );
    }
  }

  const groups = groupRows.map((group) => {
    const missing = missingGroupFields(group, itemizationMode);
    return {
      ...group,
      documentDescription: group.documentDescription ?? "",
      allowAggregation: group.allowAggregation ?? true,
      ncm: group.ncm ?? "",
      cest: group.cest ?? "",
      cfop: group.cfop ?? "",
      commercialUnit: group.commercialUnit ?? "",
      origin: group.origin ?? "",
      icmsCode: group.icmsCode ?? "",
      pisCode: group.pisCode ?? "",
      cofinsCode: group.cofinsCode ?? "",
      natureOperation: group.natureOperation ?? "",
      productCount: productCounts.get(group.id) ?? 0,
      ready: missing.length === 0,
      missing,
    };
  });

  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const products = productRows.map((product) => ({
    ...product,
    fiscalGroupName: product.fiscalGroupId
      ? groupNames.get(product.fiscalGroupId) ?? "Grupo indisponível"
      : null,
  }));

  const activeProducts = products.filter((product) => product.active);
  const assignedProducts = activeProducts.filter((product) => product.fiscalGroupId);
  const usedGroupIds = new Set(
    assignedProducts
      .map((product) => product.fiscalGroupId)
      .filter((groupId): groupId is number => Boolean(groupId)),
  );
  const usedGroups = groups.filter((group) => usedGroupIds.has(group.id));
  const incompleteUsedGroups = usedGroups.filter((group) => !group.ready);

  return {
    itemizationMode,
    groups,
    products,
    summary: {
      totalGroups: groups.length,
      readyGroups: groups.filter((group) => group.ready).length,
      totalActiveProducts: activeProducts.length,
      assignedProducts: assignedProducts.length,
      unassignedProducts: activeProducts.length - assignedProducts.length,
      incompleteUsedGroups: incompleteUsedGroups.length,
      ready:
        activeProducts.length > 0 &&
        activeProducts.length === assignedProducts.length &&
        incompleteUsedGroups.length === 0,
    },
  };
}

router.use(requireRole("max_control"));
router.use(requireStoreFeature("fiscal"));

router.get("/fiscal/catalog", async (req, res): Promise<void> => {
  try {
    const actor = await resolveCurrentActor(req);
    await requireInitialFiscalSettings(actor.storeId);
    res.json(await readCatalog(actor.storeId));
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({
      error: error instanceof Error ? error.message : "Não foi possível carregar o cadastro fiscal.",
      code: (error as Error & { code?: string }).code ?? "FISCAL_CATALOG_LOAD_FAILED",
    });
  }
});

router.post("/fiscal/groups/suggested", async (req, res): Promise<void> => {
  try {
    const actor = await resolveCurrentActor(req);
    await requireInitialFiscalSettings(actor.storeId);

    await db.transaction(async (tx) => {
      for (const suggestion of suggestedGroups) {
        const [group] = await tx
          .insert(fiscalGroupsTable)
          .values({
            storeId: actor.storeId,
            name: suggestion.name,
            description: suggestion.description,
          })
          .onConflictDoNothing()
          .returning({ id: fiscalGroupsTable.id });

        let groupId = group?.id;
        if (!groupId) {
          const [existing] = await tx
            .select({ id: fiscalGroupsTable.id })
            .from(fiscalGroupsTable)
            .where(
              and(
                eq(fiscalGroupsTable.storeId, actor.storeId),
                eq(fiscalGroupsTable.name, suggestion.name),
              ),
            )
            .limit(1);
          groupId = existing?.id;
        }

        if (groupId) {
          await tx
            .insert(fiscalGroupPresentationTable)
            .values({
              storeId: actor.storeId,
              fiscalGroupId: groupId,
              documentDescription: suggestion.documentDescription,
              allowAggregation: true,
            })
            .onConflictDoNothing();
        }
      }

      await tx.insert(fiscalAuditLogsTable).values({
        storeId: actor.storeId,
        actorUserId: actor.id,
        action: "fiscal_suggested_groups_created",
        targetType: "fiscal_groups",
        targetId: String(actor.storeId),
        metadata: { groupNames: suggestedGroups.map((group) => group.name) },
      });
    });

    res.status(201).json({
      message: "Grupos fiscais sugeridos criados. Preencha os códigos com o contador ou XMLs anteriores.",
      ...(await readCatalog(actor.storeId)),
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({
      error: error instanceof Error ? error.message : "Não foi possível criar os grupos sugeridos.",
      code: (error as Error & { code?: string }).code ?? "FISCAL_SUGGESTED_GROUPS_FAILED",
    });
  }
});

router.post("/fiscal/groups", async (req, res): Promise<void> => {
  try {
    const actor = await resolveCurrentActor(req);
    await requireInitialFiscalSettings(actor.storeId);
    const payload = normalizeGroupPayload(req.body);
    const errors = validateGroupPayload(payload);
    if (errors.length > 0) {
      res.status(400).json({
        error: "Revise os dados do grupo fiscal.",
        code: "FISCAL_GROUP_INVALID",
        fields: errors,
      });
      return;
    }

    const groupId = await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(fiscalGroupsTable)
        .values({
          storeId: actor.storeId,
          name: payload.name,
          description: payload.description || null,
        })
        .returning({ id: fiscalGroupsTable.id });

      await tx.insert(fiscalGroupRulesTable).values({
        storeId: actor.storeId,
        fiscalGroupId: group.id,
        ncm: payload.ncm || null,
        cest: payload.cest || null,
        cfop: payload.cfop || null,
        commercialUnit: payload.commercialUnit || null,
        origin: payload.origin || null,
        icmsCode: payload.icmsCode || null,
        pisCode: payload.pisCode || null,
        cofinsCode: payload.cofinsCode || null,
        natureOperation: payload.natureOperation || null,
      });

      await tx.insert(fiscalGroupPresentationTable).values({
        storeId: actor.storeId,
        fiscalGroupId: group.id,
        documentDescription: payload.documentDescription || null,
        allowAggregation: payload.allowAggregation,
      });

      await tx.insert(fiscalAuditLogsTable).values({
        storeId: actor.storeId,
        actorUserId: actor.id,
        action: "fiscal_group_created",
        targetType: "fiscal_group",
        targetId: String(group.id),
        metadata: { name: payload.name },
      });

      return group.id;
    });

    res.status(201).json({
      message: "Grupo fiscal criado.",
      groupId,
      ...(await readCatalog(actor.storeId)),
    });
  } catch (error) {
    const databaseCode = (error as { code?: string }).code;
    const duplicate = databaseCode === "23505";
    res.status(duplicate ? 409 : 500).json({
      error: duplicate
        ? "Já existe um grupo fiscal com esse nome nesta loja."
        : error instanceof Error
          ? error.message
          : "Não foi possível criar o grupo fiscal.",
      code: duplicate ? "FISCAL_GROUP_NAME_EXISTS" : "FISCAL_GROUP_CREATE_FAILED",
    });
  }
});

router.put("/fiscal/groups/:groupId", async (req, res): Promise<void> => {
  try {
    const actor = await resolveCurrentActor(req);
    await requireInitialFiscalSettings(actor.storeId);
    const groupId = Number(req.params.groupId);
    if (!Number.isSafeInteger(groupId) || groupId <= 0) {
      res.status(400).json({ error: "Grupo fiscal inválido.", code: "FISCAL_GROUP_ID_INVALID" });
      return;
    }
    const group = await ensureGroupBelongsToStore(actor.storeId, groupId);
    if (!group) {
      res.status(404).json({ error: "Grupo fiscal não encontrado.", code: "FISCAL_GROUP_NOT_FOUND" });
      return;
    }

    const payload = normalizeGroupPayload(req.body);
    const errors = validateGroupPayload(payload);
    if (errors.length > 0) {
      res.status(400).json({
        error: "Revise os dados do grupo fiscal.",
        code: "FISCAL_GROUP_INVALID",
        fields: errors,
      });
      return;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(fiscalGroupsTable)
        .set({
          name: payload.name,
          description: payload.description || null,
          updatedAt: now,
        })
        .where(and(eq(fiscalGroupsTable.id, groupId), eq(fiscalGroupsTable.storeId, actor.storeId)));

      await tx
        .insert(fiscalGroupRulesTable)
        .values({
          storeId: actor.storeId,
          fiscalGroupId: groupId,
          ncm: payload.ncm || null,
          cest: payload.cest || null,
          cfop: payload.cfop || null,
          commercialUnit: payload.commercialUnit || null,
          origin: payload.origin || null,
          icmsCode: payload.icmsCode || null,
          pisCode: payload.pisCode || null,
          cofinsCode: payload.cofinsCode || null,
          natureOperation: payload.natureOperation || null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [fiscalGroupRulesTable.storeId, fiscalGroupRulesTable.fiscalGroupId],
          set: {
            ncm: payload.ncm || null,
            cest: payload.cest || null,
            cfop: payload.cfop || null,
            commercialUnit: payload.commercialUnit || null,
            origin: payload.origin || null,
            icmsCode: payload.icmsCode || null,
            pisCode: payload.pisCode || null,
            cofinsCode: payload.cofinsCode || null,
            natureOperation: payload.natureOperation || null,
            updatedAt: now,
          },
        });

      await tx
        .insert(fiscalGroupPresentationTable)
        .values({
          storeId: actor.storeId,
          fiscalGroupId: groupId,
          documentDescription: payload.documentDescription || null,
          allowAggregation: payload.allowAggregation,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [fiscalGroupPresentationTable.storeId, fiscalGroupPresentationTable.fiscalGroupId],
          set: {
            documentDescription: payload.documentDescription || null,
            allowAggregation: payload.allowAggregation,
            updatedAt: now,
          },
        });

      await tx.insert(fiscalAuditLogsTable).values({
        storeId: actor.storeId,
        actorUserId: actor.id,
        action: "fiscal_group_updated",
        targetType: "fiscal_group",
        targetId: String(groupId),
        metadata: { name: payload.name },
      });
    });

    res.json({ message: "Grupo fiscal atualizado.", ...(await readCatalog(actor.storeId)) });
  } catch (error) {
    const databaseCode = (error as { code?: string }).code;
    const duplicate = databaseCode === "23505";
    res.status(duplicate ? 409 : 500).json({
      error: duplicate
        ? "Já existe um grupo fiscal com esse nome nesta loja."
        : error instanceof Error
          ? error.message
          : "Não foi possível atualizar o grupo fiscal.",
      code: duplicate ? "FISCAL_GROUP_NAME_EXISTS" : "FISCAL_GROUP_UPDATE_FAILED",
    });
  }
});

router.put("/fiscal/products/group", async (req, res): Promise<void> => {
  try {
    const actor = await resolveCurrentActor(req);
    await requireInitialFiscalSettings(actor.storeId);
    const source = (req.body ?? {}) as Record<string, unknown>;
    const productIds = Array.isArray(source.productIds)
      ? [...new Set(source.productIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
      : [];
    const fiscalGroupId = source.fiscalGroupId === null || source.fiscalGroupId === ""
      ? null
      : Number(source.fiscalGroupId);

    if (productIds.length === 0 || productIds.length > 500) {
      res.status(400).json({
        error: "Selecione entre 1 e 500 produtos.",
        code: "FISCAL_PRODUCTS_SELECTION_INVALID",
      });
      return;
    }

    if (fiscalGroupId !== null) {
      if (!Number.isSafeInteger(fiscalGroupId) || fiscalGroupId <= 0) {
        res.status(400).json({ error: "Grupo fiscal inválido.", code: "FISCAL_GROUP_ID_INVALID" });
        return;
      }
      const group = await ensureGroupBelongsToStore(actor.storeId, fiscalGroupId);
      if (!group || !group.active) {
        res.status(404).json({
          error: "Grupo fiscal não encontrado ou inativo.",
          code: "FISCAL_GROUP_NOT_AVAILABLE",
        });
        return;
      }
    }

    const products = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.storeId, actor.storeId), inArray(productsTable.id, productIds)));
    const validProductIds = products.map((product) => product.id);
    if (validProductIds.length !== productIds.length) {
      res.status(404).json({
        error: "Um ou mais produtos não pertencem à loja atual.",
        code: "FISCAL_PRODUCT_NOT_FOUND",
      });
      return;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      for (const productId of validProductIds) {
        await tx
          .insert(productFiscalSettingsTable)
          .values({
            storeId: actor.storeId,
            productId,
            fiscalGroupId,
            active: true,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [productFiscalSettingsTable.storeId, productFiscalSettingsTable.productId],
            set: { fiscalGroupId, active: true, updatedAt: now },
          });
      }

      await tx.insert(fiscalAuditLogsTable).values({
        storeId: actor.storeId,
        actorUserId: actor.id,
        action: "fiscal_products_group_assigned",
        targetType: "products",
        targetId: validProductIds.join(","),
        metadata: { productIds: validProductIds, fiscalGroupId },
      });
    });

    res.json({
      message:
        fiscalGroupId === null
          ? "Vínculo fiscal removido dos produtos selecionados."
          : "Grupo fiscal aplicado aos produtos selecionados.",
      ...(await readCatalog(actor.storeId)),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Não foi possível vincular os produtos.",
      code: "FISCAL_PRODUCT_ASSIGNMENT_FAILED",
    });
  }
});

export default router;
