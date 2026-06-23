import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  categoriesTable,
  db,
  fiscalAuditLogsTable,
  productFiscalSettingsTable,
  productsTable,
  storeFiscalSettingsTable,
} from "@workspace/db";
import {
  fiscalNcmPresets,
  getFiscalCodeLibrary,
} from "../lib/fiscal-code-library";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";

const router: IRouter = Router();

const clean = (value: unknown, maxLength = 180): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";
const digits = (value: unknown): string => clean(value, 40).replace(/\D/g, "");

const allowedSources = new Set(["library", "manual"]);
const allowedOrigins = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8"]);

async function readStoreTaxRegime(storeId: number): Promise<string | null> {
  const [settings] = await db
    .select({ taxRegime: storeFiscalSettingsTable.taxRegime })
    .from(storeFiscalSettingsTable)
    .where(eq(storeFiscalSettingsTable.storeId, storeId))
    .limit(1);
  return settings?.taxRegime ?? null;
}

async function readProducts(storeId: number) {
  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      active: productsTable.active,
      available: productsTable.available,
      categoryName: categoriesTable.name,
      fiscalGroupId: productFiscalSettingsTable.fiscalGroupId,
      ncm: productFiscalSettingsTable.ncm,
      cest: productFiscalSettingsTable.cest,
      cfop: productFiscalSettingsTable.cfop,
      commercialUnit: productFiscalSettingsTable.commercialUnit,
      origin: productFiscalSettingsTable.origin,
      icmsCode: productFiscalSettingsTable.icmsCode,
      pisCode: productFiscalSettingsTable.pisCode,
      cofinsCode: productFiscalSettingsTable.cofinsCode,
      natureOperation: productFiscalSettingsTable.natureOperation,
      taxData: productFiscalSettingsTable.taxData,
    })
    .from(productsTable)
    .innerJoin(
      categoriesTable,
      and(
        eq(categoriesTable.id, productsTable.categoryId),
        eq(categoriesTable.storeId, storeId),
      ),
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

  return rows.map((row) => {
    const metadata =
      row.taxData && typeof row.taxData === "object"
        ? (row.taxData as Record<string, unknown>)
        : {};
    const requiredValues = [
      row.ncm,
      row.cfop,
      row.commercialUnit,
      row.origin,
      row.icmsCode,
      row.pisCode,
      row.cofinsCode,
    ];

    return {
      ...row,
      ncm: row.ncm ?? "",
      cest: row.cest ?? "",
      cfop: row.cfop ?? "",
      commercialUnit: row.commercialUnit ?? "",
      origin: row.origin ?? "",
      icmsCode: row.icmsCode ?? "",
      pisCode: row.pisCode ?? "",
      cofinsCode: row.cofinsCode ?? "",
      natureOperation: row.natureOperation ?? "",
      ruleSource:
        metadata.source === "library" || metadata.source === "manual"
          ? metadata.source
          : null,
      libraryPresetId:
        typeof metadata.libraryPresetId === "string"
          ? metadata.libraryPresetId
          : null,
      validationStatus:
        typeof metadata.validationStatus === "string"
          ? metadata.validationStatus
          : null,
      ruleComplete: requiredValues.every(Boolean),
    };
  });
}

type RulePayload = {
  source: string;
  libraryPresetId: string;
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

function normalizeRule(body: Record<string, unknown>): RulePayload {
  return {
    source: clean(body.source, 20).toLowerCase(),
    libraryPresetId: clean(body.libraryPresetId, 80),
    ncm: digits(body.ncm).slice(0, 8),
    cest: digits(body.cest).slice(0, 7),
    cfop: digits(body.cfop).slice(0, 4),
    commercialUnit: clean(body.commercialUnit, 10).toUpperCase(),
    origin: digits(body.origin).slice(0, 1),
    icmsCode: digits(body.icmsCode).slice(0, 3),
    pisCode: digits(body.pisCode).slice(0, 2),
    cofinsCode: digits(body.cofinsCode).slice(0, 2),
    natureOperation: clean(body.natureOperation, 120),
  };
}

function validateRule(rule: RulePayload): string[] {
  const errors: string[] = [];
  if (!allowedSources.has(rule.source)) {
    errors.push("Escolha preenchimento pela biblioteca ou manual.");
  }
  if (!/^\d{8}$/.test(rule.ncm)) errors.push("O NCM deve possuir 8 dígitos.");
  if (rule.cest && !/^\d{7}$/.test(rule.cest)) {
    errors.push("O CEST deve possuir 7 dígitos quando informado.");
  }
  if (!/^\d{4}$/.test(rule.cfop)) errors.push("O CFOP deve possuir 4 dígitos.");
  if (!rule.commercialUnit) errors.push("Informe a unidade comercial.");
  if (!allowedOrigins.has(rule.origin)) errors.push("Selecione uma origem válida entre 0 e 8.");
  if (!/^\d{2,3}$/.test(rule.icmsCode)) {
    errors.push("Informe um CST ou CSOSN com 2 ou 3 dígitos.");
  }
  if (!/^\d{2}$/.test(rule.pisCode)) errors.push("O CST de PIS deve possuir 2 dígitos.");
  if (!/^\d{2}$/.test(rule.cofinsCode)) errors.push("O CST de COFINS deve possuir 2 dígitos.");

  if (rule.source === "library") {
    const preset = fiscalNcmPresets.find((item) => item.id === rule.libraryPresetId);
    if (!preset) errors.push("Selecione um item válido da biblioteca de NCM.");
    else if (preset.ncm !== rule.ncm) {
      errors.push("O NCM informado não corresponde ao item selecionado na biblioteca.");
    }
  }

  return errors;
}

router.use(requireRole("max_control"));
router.use(requireStoreFeature("fiscal"));

router.get("/fiscal/code-library", async (req, res): Promise<void> => {
  try {
    const actor = await resolveCurrentActor(req);
    const taxRegime = await readStoreTaxRegime(actor.storeId);
    if (!taxRegime) {
      res.status(409).json({
        error: "Conclua primeiro a configuração fiscal inicial da empresa.",
        code: "FISCAL_INITIAL_SETUP_REQUIRED",
      });
      return;
    }

    const products = await readProducts(actor.storeId);
    res.json({
      taxRegime,
      library: getFiscalCodeLibrary(taxRegime),
      products,
      summary: {
        totalActiveProducts: products.filter((product) => product.active).length,
        completeRules: products.filter((product) => product.active && product.ruleComplete).length,
        pendingRules: products.filter((product) => product.active && !product.ruleComplete).length,
        pendingValidation: products.filter(
          (product) => product.active && product.validationStatus === "pending_accountant_validation",
        ).length,
      },
    });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a biblioteca fiscal.",
      code: "FISCAL_CODE_LIBRARY_LOAD_FAILED",
    });
  }
});

router.put("/fiscal/product-rules", async (req, res): Promise<void> => {
  try {
    const actor = await resolveCurrentActor(req);
    const source = (req.body ?? {}) as Record<string, unknown>;
    const productIds = Array.isArray(source.productIds)
      ? [
          ...new Set(
            source.productIds
              .map(Number)
              .filter((id) => Number.isSafeInteger(id) && id > 0),
          ),
        ]
      : [];

    if (productIds.length === 0 || productIds.length > 500) {
      res.status(400).json({
        error: "Selecione entre 1 e 500 produtos.",
        code: "FISCAL_PRODUCTS_SELECTION_INVALID",
      });
      return;
    }

    const rule = normalizeRule(source);
    const errors = validateRule(rule);
    if (errors.length > 0) {
      res.status(400).json({
        error: "Revise a regra fiscal antes de aplicar.",
        code: "FISCAL_PRODUCT_RULE_INVALID",
        fields: errors,
      });
      return;
    }

    const products = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.storeId, actor.storeId),
          inArray(productsTable.id, productIds),
        ),
      );
    const validProductIds = products.map((product) => product.id);
    if (validProductIds.length !== productIds.length) {
      res.status(404).json({
        error: "Um ou mais produtos não pertencem à loja atual.",
        code: "FISCAL_PRODUCT_NOT_FOUND",
      });
      return;
    }

    const appliedAt = new Date();
    const taxData = {
      source: rule.source,
      libraryPresetId:
        rule.source === "library" ? rule.libraryPresetId : null,
      validationStatus: "pending_accountant_validation",
      appliedAt: appliedAt.toISOString(),
      appliedByUserId: actor.id,
    };

    await db.transaction(async (tx) => {
      for (const productId of validProductIds) {
        await tx
          .insert(productFiscalSettingsTable)
          .values({
            storeId: actor.storeId,
            productId,
            ncm: rule.ncm,
            cest: rule.cest || null,
            cfop: rule.cfop,
            commercialUnit: rule.commercialUnit,
            origin: rule.origin,
            icmsCode: rule.icmsCode,
            pisCode: rule.pisCode,
            cofinsCode: rule.cofinsCode,
            natureOperation: rule.natureOperation || null,
            taxData,
            active: true,
            updatedAt: appliedAt,
          })
          .onConflictDoUpdate({
            target: [
              productFiscalSettingsTable.storeId,
              productFiscalSettingsTable.productId,
            ],
            set: {
              ncm: rule.ncm,
              cest: rule.cest || null,
              cfop: rule.cfop,
              commercialUnit: rule.commercialUnit,
              origin: rule.origin,
              icmsCode: rule.icmsCode,
              pisCode: rule.pisCode,
              cofinsCode: rule.cofinsCode,
              natureOperation: rule.natureOperation || null,
              taxData,
              active: true,
              updatedAt: appliedAt,
            },
          });
      }

      await tx.insert(fiscalAuditLogsTable).values({
        storeId: actor.storeId,
        actorUserId: actor.id,
        action: "fiscal_product_rules_applied",
        targetType: "products",
        targetId: validProductIds.join(","),
        metadata: {
          productIds: validProductIds,
          source: rule.source,
          libraryPresetId:
            rule.source === "library" ? rule.libraryPresetId : null,
          ncm: rule.ncm,
          cest: rule.cest || null,
          cfop: rule.cfop,
          icmsCode: rule.icmsCode,
          validationStatus: "pending_accountant_validation",
        },
      });
    });

    const updatedProducts = await readProducts(actor.storeId);
    res.json({
      message:
        validProductIds.length === 1
          ? "Regra fiscal salva para o produto."
          : `Regra fiscal aplicada a ${validProductIds.length} produtos.`,
      products: updatedProducts,
      summary: {
        totalActiveProducts: updatedProducts.filter((product) => product.active).length,
        completeRules: updatedProducts.filter(
          (product) => product.active && product.ruleComplete,
        ).length,
        pendingRules: updatedProducts.filter(
          (product) => product.active && !product.ruleComplete,
        ).length,
        pendingValidation: updatedProducts.filter(
          (product) =>
            product.active &&
            product.validationStatus === "pending_accountant_validation",
        ).length,
      },
    });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível aplicar a regra fiscal.",
      code: "FISCAL_PRODUCT_RULE_SAVE_FAILED",
    });
  }
});

export default router;
