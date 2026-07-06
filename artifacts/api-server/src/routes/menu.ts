import { Router, type IRouter } from "express";
import { eq, ilike, and, ne, inArray, asc, sql } from "drizzle-orm";
import { getCurrentActor } from "../middleware/rbac";
import {
  db,
  categoriesTable,
  productsTable,
  productVariantsTable,
  orderItemsTable,
  variantTemplatesTable,
  variantTemplateOptionsTable,
  addonGroupsTable,
  addonOptionsTable,
  productAddonGroupsTable,
  pizzaSizesTable,
  pizzaPriceTiersTable,
  pizzaSizeTierPricesTable,
  pizzaFlavorsTable,
  multiflavorGroupsTable,
  multiflavorSizesTable,
  multiflavorClassificationsTable,
  multiflavorSizeClassificationPricesTable,
  multiflavorFlavorsTable,
  multiflavorGroupAddonGroupsTable,
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

type ImportMode = "upsert" | "skip" | "create_only" | "update_only";
type ImportError = { rowNumber: number; field: string; message: string };
type ImportWarning = { rowNumber: number; field?: string; message: string };
type ParsedVariant = { name: string; price: number };
type ParsedAddonGroup = {
  name: string;
  required: boolean;
  minSelected: number;
  maxSelected: number | null;
  options: { name: string; price: number }[];
};
type ParsedImportRow = {
  rowNumber: number;
  category: string;
  product: string;
  description: string | null;
  price: number;
  sku: string | null;
  barcode: string | null;
  costPrice: number | null;
  unit: string;
  preparationTimeMinutes: number | null;
  trackStock: boolean;
  stockQty: number | null;
  stockMinQty: number | null;
  allowSaleWithoutStock: boolean;
  available: boolean;
  active: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  variants: ParsedVariant[];
  addons: ParsedAddonGroup[];
  pizzaConfigs: {
    size: string;
    price: number;
    classification: string;
    maxFlavors: number;
  }[];
};


const MENU_RESET_CONFIRMATION = "LIMPAR CARDAPIO";

type MenuResetPreview = {
  categories: number;
  products: number;
  variants: number;
  addonGroups: number;
  addonOptions: number;
  productAddonLinks: number;
  legacyPizzaConfigs: number;
  multiflavorGroups: number;
  multiflavorSizes: number;
  multiflavorClassifications: number;
  multiflavorPrices: number;
  multiflavorFlavors: number;
  multiflavorAddonLinks: number;
  orderItemsToDetach: number;
  orderItemAddonsToDetach: number;
};

async function getMenuResetPreview(storeId: number): Promise<MenuResetPreview> {
  const result = await db.execute<MenuResetPreview>(sql`
    select
      (select count(*)::int from categories where store_id = ${storeId}) as "categories",
      (select count(*)::int from products where store_id = ${storeId}) as "products",
      (select count(*)::int from product_variants where store_id = ${storeId}) as "variants",
      (select count(*)::int from addon_groups where store_id = ${storeId}) as "addonGroups",
      (select count(*)::int from addon_options where store_id = ${storeId}) as "addonOptions",
      (select count(*)::int from product_addon_groups where store_id = ${storeId}) as "productAddonLinks",
      (
        (select count(*)::int from pizza_flavors where store_id = ${storeId}) +
        (select count(*)::int from pizza_size_tier_prices where store_id = ${storeId}) +
        (select count(*)::int from pizza_price_tiers where store_id = ${storeId}) +
        (select count(*)::int from pizza_sizes where store_id = ${storeId})
      ) as "legacyPizzaConfigs",
      (select count(*)::int from multiflavor_groups where store_id = ${storeId}) as "multiflavorGroups",
      (select count(*)::int from multiflavor_sizes where store_id = ${storeId}) as "multiflavorSizes",
      (select count(*)::int from multiflavor_classifications where store_id = ${storeId}) as "multiflavorClassifications",
      (select count(*)::int from multiflavor_size_classification_prices where store_id = ${storeId}) as "multiflavorPrices",
      (select count(*)::int from multiflavor_flavors where store_id = ${storeId}) as "multiflavorFlavors",
      (select count(*)::int from multiflavor_group_addon_groups where store_id = ${storeId}) as "multiflavorAddonLinks",
      (
        select count(*)::int
        from order_items oi
        inner join orders o on o.id = oi.order_id and o.store_id = ${storeId}
        inner join products p on p.id = oi.product_id and p.store_id = ${storeId}
      ) as "orderItemsToDetach",
      (
        select count(*)::int
        from order_item_addons oia
        inner join addon_options ao on ao.id = oia.addon_option_id and ao.store_id = ${storeId}
        inner join order_items oi on oi.id = oia.order_item_id
        inner join orders o on o.id = oi.order_id and o.store_id = ${storeId}
      ) as "orderItemAddonsToDetach"
  `);
  return result.rows[0] ?? {
    categories: 0,
    products: 0,
    variants: 0,
    addonGroups: 0,
    addonOptions: 0,
    productAddonLinks: 0,
    legacyPizzaConfigs: 0,
    multiflavorGroups: 0,
    multiflavorSizes: 0,
    multiflavorClassifications: 0,
    multiflavorPrices: 0,
    multiflavorFlavors: 0,
    multiflavorAddonLinks: 0,
    orderItemsToDetach: 0,
    orderItemAddonsToDetach: 0,
  };
}

function requireMaxControl(actor: { role: string }, res: { status: (code: number) => { json: (body: unknown) => unknown } }): boolean {
  if (actor.role === "max_control") return true;
  res.status(403).json({ error: "Apenas max_control pode limpar o cardápio da loja." });
  return false;
}


router.get("/menu/reset-preview", async (req, res) => {
  const actor = await getCurrentActor(req);
  if (!requireMaxControl(actor, res)) return;
  res.json(await getMenuResetPreview(actor.storeId));
});

router.post("/menu/reset", async (req, res) => {
  const actor = await getCurrentActor(req);
  if (!requireMaxControl(actor, res)) return;

  if (req.body?.confirmation !== MENU_RESET_CONFIRMATION) {
    res.status(400).json({ error: `Digite exatamente ${MENU_RESET_CONFIRMATION} para confirmar.` });
    return;
  }

  const preview = await db.transaction(async (tx) => {
    const before = await getMenuResetPreview(actor.storeId);

    await tx.execute(sql`
      update order_items oi
      set external_product_name = coalesce(nullif(oi.external_product_name, ''), nullif(oi.display_name, ''), p.name)
      from orders o, products p
      where oi.order_id = o.id
        and oi.product_id = p.id
        and o.store_id = ${actor.storeId}
        and p.store_id = ${actor.storeId}
        and (oi.external_product_name is null or oi.external_product_name = '')
    `);
    await tx.execute(sql`
      update order_items oi
      set product_id = null,
          variant_id = null,
          pizza_size_id = null,
          base_pizza_tier_id = null
      from orders o, products p
      where oi.order_id = o.id
        and oi.product_id = p.id
        and o.store_id = ${actor.storeId}
        and p.store_id = ${actor.storeId}
    `);
    await tx.execute(sql`
      update order_item_addons oia
      set addon_option_id = null
      from addon_options ao, order_items oi, orders o
      where oia.addon_option_id = ao.id
        and oia.order_item_id = oi.id
        and oi.order_id = o.id
        and ao.store_id = ${actor.storeId}
        and o.store_id = ${actor.storeId}
    `);
    await tx.execute(sql`
      update order_item_flavors oif
      set product_id = null,
          tier_id = null
      from order_items oi, orders o
      where oif.order_item_id = oi.id
        and oi.order_id = o.id
        and o.store_id = ${actor.storeId}
        and (
          exists (select 1 from products p where p.id = oif.product_id and p.store_id = ${actor.storeId})
          or exists (select 1 from pizza_price_tiers ppt where ppt.id = oif.tier_id and ppt.store_id = ${actor.storeId})
        )
    `);

    await tx.delete(multiflavorGroupAddonGroupsTable).where(eq(multiflavorGroupAddonGroupsTable.storeId, actor.storeId));
    await tx.delete(multiflavorFlavorsTable).where(eq(multiflavorFlavorsTable.storeId, actor.storeId));
    await tx.delete(multiflavorSizeClassificationPricesTable).where(eq(multiflavorSizeClassificationPricesTable.storeId, actor.storeId));
    await tx.delete(multiflavorClassificationsTable).where(eq(multiflavorClassificationsTable.storeId, actor.storeId));
    await tx.delete(multiflavorSizesTable).where(eq(multiflavorSizesTable.storeId, actor.storeId));
    await tx.delete(multiflavorGroupsTable).where(eq(multiflavorGroupsTable.storeId, actor.storeId));
    await tx.delete(pizzaFlavorsTable).where(eq(pizzaFlavorsTable.storeId, actor.storeId));
    await tx.delete(pizzaSizeTierPricesTable).where(eq(pizzaSizeTierPricesTable.storeId, actor.storeId));
    await tx.delete(pizzaPriceTiersTable).where(eq(pizzaPriceTiersTable.storeId, actor.storeId));
    await tx.delete(pizzaSizesTable).where(eq(pizzaSizesTable.storeId, actor.storeId));
    await tx.delete(productAddonGroupsTable).where(eq(productAddonGroupsTable.storeId, actor.storeId));
    await tx.delete(addonOptionsTable).where(eq(addonOptionsTable.storeId, actor.storeId));
    await tx.delete(addonGroupsTable).where(eq(addonGroupsTable.storeId, actor.storeId));
    await tx.delete(productVariantsTable).where(eq(productVariantsTable.storeId, actor.storeId));
    await tx.delete(productsTable).where(eq(productsTable.storeId, actor.storeId));
    await tx.delete(categoriesTable).where(eq(categoriesTable.storeId, actor.storeId));

    return before;
  });

  res.json({ ok: true, preview });
});

const IMPORT_MAX_BYTES = 1024 * 1024;
const IMPORT_MAX_ROWS = 1000;
const IMPORT_TEMPLATE_HEADERS = [
  "categoria",
  "produto",
  "descricao",
  "preco",
  "sku",
  "ativo",
];
const IMPORT_TEMPLATE_ROWS = [
  [
    "Pizzas",
    "Pizza Calabresa",
    "Molho, mussarela, calabresa e cebola",
    "49,90",
    "PIZ-CAL",
    "sim",
  ],
  [
    "Pizzas",
    "Pizza Mussarela",
    "Molho, mussarela e orégano",
    "44,90",
    "PIZ-MUS",
    "sim",
  ],
  [
    "Bebidas",
    "Coca-Cola 2L",
    "Refrigerante 2 litros",
    "12,00",
    "COCA-2L",
    "sim",
  ],
];
const ADVANCED_TEMPLATE_HEADERS = [
  "tipo",
  "categoria",
  "produto",
  "descricao",
  "preco",
  "sku",
  "ativo",
  "tamanho",
  "preco_tamanho",
  "grupo_complemento",
  "complemento",
  "preco_complemento",
  "obrigatorio",
  "max_escolhas",
  "multissabor",
  "classificacao",
  "max_sabores",
];
const ADVANCED_TEMPLATE_ROWS = [
  [
    "produto",
    "Pizzas",
    "Pizza Calabresa",
    "Molho, mussarela, calabresa e cebola",
    "49,90",
    "PIZ-CAL",
    "sim",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "Salgada",
    "",
  ],
  [
    "tamanho",
    "Pizzas",
    "Pizza Calabresa",
    "",
    "",
    "PIZ-CAL",
    "sim",
    "Grande",
    "59,90",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
  [
    "complemento",
    "Pizzas",
    "Pizza Calabresa",
    "",
    "",
    "PIZ-CAL",
    "sim",
    "",
    "",
    "Bordas",
    "Catupiry",
    "8,00",
    "não",
    "1",
    "",
    "",
    "",
  ],
  [
    "multissabor",
    "Pizzas",
    "Pizza Calabresa",
    "",
    "",
    "PIZ-CAL",
    "sim",
    "Grande",
    "59,90",
    "",
    "",
    "",
    "",
    "",
    "sim",
    "Salgada",
    "2",
  ],
];
const HEADER_ALIASES: Record<string, string[]> = {
  categoria: ["categoria", "category", "categoria_nome"],
  produto: ["produto", "product", "nome", "name"],
  preco: ["preco_base", "preco", "preço", "price", "valor"],
  descricao: ["descricao", "descrição", "description"],
  serve_quantas_pessoas: ["serve_quantas_pessoas", "serve", "serves"],
  sku: ["sku"],
  codigo_barras: ["codigo_barras", "código_barras", "barcode", "ean"],
  preco_custo: ["preco_custo", "preço_custo", "cost_price", "custo"],
  unidade: ["unidade", "unit"],
  tempo_preparo_min: [
    "tempo_preparo_min",
    "tempo_preparo",
    "preparation_time_minutes",
  ],
  controlar_estoque: ["controlar_estoque", "track_stock"],
  estoque_atual: ["estoque_atual", "stock_qty"],
  estoque_minimo: ["estoque_minimo", "stock_min_qty"],
  vender_sem_estoque: ["vender_sem_estoque", "allow_sale_without_stock"],
  disponivel: ["disponivel", "disponível", "available"],
  ativo: ["ativo", "active"],
  imagem_url: ["imagem_url", "image_url"],
  imagem_alt: ["imagem_alt", "image_alt"],
  tipo: ["tipo", "type"],
  tamanho: ["tamanho", "size"],
  preco_tamanho: ["preco_tamanho", "preço_tamanho", "size_price"],
  grupo_complemento: ["grupo_complemento", "grupo", "addon_group"],
  complemento: ["complemento", "addon", "option"],
  preco_complemento: ["preco_complemento", "preço_complemento", "addon_price"],
  obrigatorio: ["obrigatorio", "obrigatório", "required"],
  max_escolhas: ["max_escolhas", "max", "max_selected"],
  multissabor: ["multissabor"],
  classificacao: ["classificacao", "classificação", "tier"],
  max_sabores: ["max_sabores", "max_flavors"],
  tamanhos: ["tamanhos", "variacoes", "variações", "variants"],
  bordas: ["bordas"],
  complementos: ["complementos", "adicionais", "addons"],
  observacoes_internas: [
    "observacoes_internas",
    "observações_internas",
    "internal_notes",
  ],
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
function csvEscape(value: string) {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function toCsv(rows: string[][]) {
  return rows.map((r) => r.map(csvEscape).join(";")).join("\n") + "\n";
}
function normalizePriceValue(value: string): {
  value: number | null;
  error?: string;
} {
  const original = value;
  let v = value
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (!v) return { value: null, error: "vazio" };
  const hasComma = v.includes(",");
  const hasDot = v.includes(".");
  if (hasComma && hasDot) {
    v =
      v.lastIndexOf(",") > v.lastIndexOf(".")
        ? v.replace(/\./g, "").replace(",", ".")
        : v.replace(/,/g, "");
  } else if (hasComma) {
    v = v.replace(/\./g, "").replace(",", ".");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(v)) {
    return {
      value: null,
      error: `preço inválido "${original}". Use exemplo: 49,90.`,
    };
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    return {
      value: null,
      error: `preço inválido "${original}". Use exemplo: 49,90.`,
    };
  }
  return { value: n };
}
function parseNumberValue(
  value: string,
  field: string,
  rowNumber: number,
  errors: ImportError[],
  required = false,
  productName?: string,
): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    if (required)
      errors.push({
        rowNumber,
        field,
        message: `Linha ${rowNumber}: coluna "${field}" está vazia${productName ? ` para o produto "${productName}"` : ""}.`,
      });
    return null;
  }
  const parsed = normalizePriceValue(trimmed);
  if (parsed.error) {
    errors.push({
      rowNumber,
      field,
      message: `Linha ${rowNumber}: ${parsed.error}`,
    });
    return null;
  }
  return parsed.value;
}
function parseIntegerValue(
  value: string,
  field: string,
  rowNumber: number,
  errors: ImportError[],
): number | null {
  if (!value.trim()) return null;
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < 0) {
    errors.push({ rowNumber, field, message: `${field} inválido.` });
    return null;
  }
  return n;
}
function parseBooleanValue(value: string, fallback: boolean): boolean {
  const v = normalizeHeader(value);
  if (!v) return fallback;
  if (
    [
      "true",
      "yes",
      "sim",
      "s",
      "1",
      "ativo",
      "disponivel",
      "disponível",
    ].includes(v)
  )
    return true;
  if (
    [
      "false",
      "no",
      "nao",
      "não",
      "n",
      "0",
      "inativo",
      "indisponivel",
      "indisponível",
    ].includes(v)
  )
    return false;
  return fallback;
}
function detectDelimiter(text: string) {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  return (firstLine.match(/;/g)?.length ?? 0) >=
    (firstLine.match(/,/g)?.length ?? 0)
    ? ";"
    : ",";
}
function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i],
      next = input[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
function mapHeaders(headers: string[], errors: ImportError[]) {
  const normalized = headers.map(normalizeHeader);
  const map: Record<string, number> = {};
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) =>
      aliases.map(normalizeHeader).includes(h),
    );
    if (idx >= 0) map[canonical] = idx;
  }
  for (const required of ["categoria", "produto", "preco"])
    if (map[required] === undefined)
      errors.push({
        rowNumber: 1,
        field: required,
        message: `Coluna obrigatória ausente: ${required}.`,
      });
  return map;
}
const cell = (row: string[], map: Record<string, number>, key: string) =>
  map[key] === undefined ? "" : (row[map[key]] ?? "").trim();

function buildDescription(description: string, serves: string) {
  const base = description.trim();
  const people = serves.trim();
  if (!people) return base || null;
  const suffix = `Serve até ${people} ${people === "1" ? "pessoa" : "pessoas"}.`;
  return base ? `${base}\n${suffix}` : suffix;
}
function parseVariants(
  value: string,
  rowNumber: number,
  errors: ImportError[],
) {
  if (!value.trim()) return [];
  const variants = value.split("|").map((part) => {
    const [name, ...priceParts] = part.split(":");
    if (!name.trim())
      errors.push({
        rowNumber,
        field: "tamanhos",
        message: `Linha ${rowNumber}: tamanho sem nome.`,
      });
    if (!priceParts.join(":").trim())
      errors.push({
        rowNumber,
        field: "tamanhos",
        message: `Linha ${rowNumber}: tamanho ${name.trim() || "sem nome"} está sem preço.`,
      });
    const price = parseNumberValue(
      priceParts.join(":"),
      "tamanhos",
      rowNumber,
      errors,
      true,
    );
    return { name: name.trim(), price: price ?? 0 };
  });
  if (variants.length > 50)
    errors.push({
      rowNumber,
      field: "tamanhos",
      message: "Máximo de 50 tamanhos por produto.",
    });
  return variants;
}
function parseAddons(
  value: string,
  rowNumber: number,
  errors: ImportError[],
  defaultGroupName?: string,
  defaultMaxSelected: number | null = null,
) {
  if (!value.trim()) return [];
  const groups = value.split(";").map((raw) => {
    const parts = raw
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    const first = parts.shift() ?? "";
    const simpleOption = Boolean(defaultGroupName) && first.includes(":");
    const name = simpleOption ? defaultGroupName! : first;
    if (simpleOption) parts.unshift(first);
    const group: ParsedAddonGroup = {
      name,
      required: false,
      minSelected: 0,
      maxSelected: defaultMaxSelected,
      options: [],
    };
    if (!name)
      errors.push({
        rowNumber,
        field: "adicionais",
        message: "Grupo de adicional sem nome.",
      });
    for (const part of parts) {
      const [key, ...rest] = part.split(":");
      const val = rest.join(":");
      const k = normalizeHeader(key);
      if (["obrigatorio", "required"].includes(k))
        group.required = parseBooleanValue(val, false);
      else if (k === "min")
        group.minSelected =
          parseIntegerValue(val, "adicionais", rowNumber, errors) ?? 0;
      else if (k === "max")
        group.maxSelected = parseIntegerValue(
          val,
          "adicionais",
          rowNumber,
          errors,
        );
      else {
        const price = parseNumberValue(
          val,
          "adicionais",
          rowNumber,
          errors,
          true,
        );
        if (!key.trim())
          errors.push({
            rowNumber,
            field: "adicionais",
            message: "Opção de adicional sem nome.",
          });
        group.options.push({ name: key.trim(), price: price ?? 0 });
      }
    }
    if (!group.options.length)
      errors.push({
        rowNumber,
        field: "adicionais",
        message: "Grupo de adicional sem opções.",
      });
    if (group.options.length > 100)
      errors.push({
        rowNumber,
        field: "adicionais",
        message: "Máximo de 100 opções por grupo.",
      });
    return group;
  });
  if (groups.length > 30)
    errors.push({
      rowNumber,
      field: "adicionais",
      message: "Máximo de 30 grupos de adicionais por produto.",
    });
  return groups;
}
async function buildImportPreview(
  csv: string,
  storeId: number,
  mode: ImportMode = "upsert",
) {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  if (Buffer.byteLength(csv || "", "utf8") > IMPORT_MAX_BYTES)
    errors.push({
      rowNumber: 0,
      field: "csv",
      message: "Arquivo muito grande.",
    });
  const parsed = parseCsv(csv || "");
  if (parsed.length <= 1)
    errors.push({
      rowNumber: 0,
      field: "csv",
      message: "A planilha está vazia.",
    });
  const map = parsed[0] ? mapHeaders(parsed[0], errors) : {};
  const dataRows = parsed.slice(1);
  if (dataRows.length > IMPORT_MAX_ROWS)
    errors.push({
      rowNumber: 0,
      field: "csv",
      message: `Máximo de ${IMPORT_MAX_ROWS} linhas por importação.`,
    });
  const categories = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.storeId, storeId));
  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      categoryId: productsTable.categoryId,
      sku: productsTable.sku,
    })
    .from(productsTable)
    .where(eq(productsTable.storeId, storeId));
  const categoryByName = new Map(
    categories.map((c) => [normalizeHeader(c.name), c]),
  );
  const seen = new Set<string>();
  const rows: any[] = [];
  const validRows: ParsedImportRow[] = [];
  const newCat = new Set<string>();
  let newProducts = 0,
    updateProducts = 0,
    variantsToCreate = 0,
    multissaborToConfigure = 0,
    addonGroupsToCreate = 0,
    addonOptionsToCreate = 0,
    bordersToCreate = 0;
  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2,
      row = dataRows[i];
    const before = errors.length;
    const category = cell(row, map, "categoria"),
      product = cell(row, map, "produto");
    const tipo = normalizeHeader(cell(row, map, "tipo") || "produto");
    const sku = cell(row, map, "sku") || null;
    const isAdvancedChild = ["tamanho", "complemento", "multissabor"].includes(
      tipo,
    );
    if (!category)
      errors.push({
        rowNumber,
        field: "categoria",
        message: `Linha ${rowNumber}: categoria obrigatória não informada.`,
      });
    if (!product)
      errors.push({
        rowNumber,
        field: "produto",
        message: `Linha ${rowNumber}: produto obrigatório não informado.`,
      });
    const price = parseNumberValue(
      cell(row, map, "preco") ||
        (isAdvancedChild ? cell(row, map, "preco_tamanho") || "0" : ""),
      "preco",
      rowNumber,
      errors,
      !isAdvancedChild,
      product,
    );
    const costPrice = parseNumberValue(
      cell(row, map, "preco_custo"),
      "preco_custo",
      rowNumber,
      errors,
    );
    const preparationTimeMinutes = parseIntegerValue(
      cell(row, map, "tempo_preparo_min"),
      "tempo_preparo_min",
      rowNumber,
      errors,
    );
    const stockQty = parseNumberValue(
      cell(row, map, "estoque_atual"),
      "estoque_atual",
      rowNumber,
      errors,
    );
    const stockMinQty = parseNumberValue(
      cell(row, map, "estoque_minimo"),
      "estoque_minimo",
      rowNumber,
      errors,
    );
    const variants = parseVariants(
      cell(row, map, "tamanhos"),
      rowNumber,
      errors,
    );
    if (["tamanho", "multissabor"].includes(tipo)) {
      const sizeName = cell(row, map, "tamanho");
      const sizePrice = parseNumberValue(
        cell(row, map, "preco_tamanho"),
        "preco_tamanho",
        rowNumber,
        errors,
        true,
        product,
      );
      if (!sizeName)
        errors.push({
          rowNumber,
          field: "tamanho",
          message: `Linha ${rowNumber}: tamanho obrigatório não informado.`,
        });
      if (sizeName && sizePrice !== null)
        variants.push({ name: sizeName, price: sizePrice });
    }
    const bordas = parseAddons(
      cell(row, map, "bordas"),
      rowNumber,
      errors,
      "Bordas",
      1,
    );
    const complementos = parseAddons(
      cell(row, map, "complementos"),
      rowNumber,
      errors,
    );
    if (tipo === "complemento") {
      const groupName = cell(row, map, "grupo_complemento");
      const optionName = cell(row, map, "complemento");
      const optionPrice = parseNumberValue(
        cell(row, map, "preco_complemento") || "0",
        "preco_complemento",
        rowNumber,
        errors,
        true,
        product,
      );
      if (!groupName)
        errors.push({
          rowNumber,
          field: "grupo_complemento",
          message: `Linha ${rowNumber}: grupo de complemento obrigatório não informado.`,
        });
      if (!optionName)
        errors.push({
          rowNumber,
          field: "complemento",
          message: `Linha ${rowNumber}: complemento obrigatório não informado.`,
        });
      if (groupName && optionName && optionPrice !== null)
        complementos.push({
          name: groupName,
          required: parseBooleanValue(cell(row, map, "obrigatorio"), false),
          minSelected: 0,
          maxSelected: parseIntegerValue(
            cell(row, map, "max_escolhas"),
            "max_escolhas",
            rowNumber,
            errors,
          ),
          options: [{ name: optionName, price: optionPrice }],
        });
    }
    const addons = [...bordas, ...complementos];
    if (cell(row, map, "observacoes_internas"))
      warnings.push({
        rowNumber,
        field: "observacoes_internas",
        message: "observacoes_internas é informativa e não será importada.",
      });
    const key = sku
      ? `sku::${normalizeHeader(sku)}`
      : `${normalizeHeader(category)}::${normalizeHeader(product)}`;
    if (!isAdvancedChild && seen.has(key))
      errors.push({
        rowNumber,
        field: "produto",
        message: "Produto duplicado na mesma categoria dentro da planilha.",
      });
    if (!isAdvancedChild) seen.add(key);
    const cat = categoryByName.get(normalizeHeader(category));
    if (category && !cat) newCat.add(normalizeHeader(category));
    const existing = sku
      ? products.find(
          (p) => p.sku && normalizeHeader(p.sku) === normalizeHeader(sku),
        )
      : cat
        ? products.find(
            (p) =>
              p.categoryId === cat.id &&
              normalizeHeader(p.name) === normalizeHeader(product),
          )
        : undefined;
    let action: "create_product" | "update_product" | "skip_duplicate" =
      "create_product";
    if (existing) {
      if (mode === "create_only")
        errors.push({
          rowNumber,
          field: "produto",
          message: "Produto já existe nesta categoria.",
        });
      else if (mode === "skip") action = "skip_duplicate";
      else action = "update_product";
    } else if (mode === "update_only") {
      errors.push({
        rowNumber,
        field: "produto",
        message: "Produto não encontrado para atualização nesta loja.",
      });
    }
    if (errors.length === before) {
      validRows.push({
        rowNumber,
        category,
        product,
        description: buildDescription(
          cell(row, map, "descricao"),
          cell(row, map, "serve_quantas_pessoas"),
        ),
        price: price!,
        sku,
        barcode: cell(row, map, "codigo_barras") || null,
        costPrice,
        unit: cell(row, map, "unidade") || "unidade",
        preparationTimeMinutes,
        trackStock: parseBooleanValue(
          cell(row, map, "controlar_estoque"),
          false,
        ),
        stockQty,
        stockMinQty,
        allowSaleWithoutStock: parseBooleanValue(
          cell(row, map, "vender_sem_estoque"),
          false,
        ),
        available: parseBooleanValue(cell(row, map, "disponivel"), true),
        active: parseBooleanValue(cell(row, map, "ativo"), true),
        imageUrl: cell(row, map, "imagem_url") || null,
        imageAlt: cell(row, map, "imagem_alt") || null,
        variants,
        addons,
        pizzaConfigs:
          tipo === "multissabor" && cell(row, map, "tamanho")
            ? [
                {
                  size: cell(row, map, "tamanho"),
                  price:
                    parseNumberValue(
                      cell(row, map, "preco_tamanho"),
                      "preco_tamanho",
                      rowNumber,
                      errors,
                    ) ??
                    price ??
                    0,
                  classification: cell(row, map, "classificacao") || "Padrão",
                  maxFlavors:
                    parseIntegerValue(
                      cell(row, map, "max_sabores"),
                      "max_sabores",
                      rowNumber,
                      errors,
                    ) ?? 2,
                },
              ]
            : [],
      });
      if (action === "create_product") newProducts++;
      if (action === "update_product") updateProducts++;
      variantsToCreate += variants.length;
      if (tipo === "multissabor") multissaborToConfigure++;
      for (const g of bordas) {
        bordersToCreate += g.options.length;
        addonOptionsToCreate += g.options.length;
      }
      for (const g of complementos) {
        addonGroupsToCreate++;
        addonOptionsToCreate += g.options.length;
      }
    }
    rows.push({
      rowNumber,
      status: errors.length === before ? "valid" : "error",
      action,
      category,
      product,
      price: price ?? null,
      warnings: warnings.filter((w) => w.rowNumber === rowNumber),
    });
  }
  return {
    ok: errors.length === 0,
    summary: {
      totalRows: dataRows.length,
      validRows: validRows.length,
      errorRows: dataRows.length - validRows.length,
      newCategories: newCat.size,
      newProducts,
      updateProducts,
      variantsToCreate,
      bordersToCreate,
      addonGroupsToCreate,
      addonOptionsToCreate,
      multissaborToConfigure,
    },
    rows,
    errors,
    warnings,
    validRows,
  };
}

router.get("/menu/import-template", async (_req, res): Promise<void> => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="modelo-importacao-cardapio.csv"',
  );
  res.send(toCsv([IMPORT_TEMPLATE_HEADERS, ...IMPORT_TEMPLATE_ROWS]));
});

router.get(
  "/menu/import-template/advanced",
  async (_req, res): Promise<void> => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="modelo-avancado-importacao-cardapio.csv"',
    );
    res.send(toCsv([ADVANCED_TEMPLATE_HEADERS, ...ADVANCED_TEMPLATE_ROWS]));
  },
);

router.post("/menu/import-preview", async (req, res): Promise<void> => {
  const { storeId } = await getCurrentActor(req);
  const body = req.body as { csv?: unknown; mode?: ImportMode };
  const csv = typeof body.csv === "string" ? body.csv : "";
  const mode: ImportMode = [
    "upsert",
    "skip",
    "create_only",
    "update_only",
  ].includes(String(body.mode))
    ? body.mode!
    : "upsert";
  const preview = await buildImportPreview(csv, storeId, mode);
  res.status(preview.ok ? 200 : 400).json({ ...preview, validRows: undefined });
});

router.post("/menu/import", async (req, res): Promise<void> => {
  const { storeId } = await getCurrentActor(req);
  const body = req.body as { csv?: unknown; mode?: ImportMode };
  const csv = typeof body.csv === "string" ? body.csv : "";
  const mode: ImportMode = [
    "upsert",
    "skip",
    "create_only",
    "update_only",
  ].includes(String(body.mode))
    ? body.mode!
    : "upsert";
  const preview = await buildImportPreview(csv, storeId, mode);
  if (!preview.ok) {
    res
      .status(400)
      .json({ ok: false, errors: preview.errors, warnings: preview.warnings });
    return;
  }
  const summary = {
    createdCategories: 0,
    createdProducts: 0,
    updatedProducts: 0,
    skippedProducts: 0,
    createdVariants: 0,
    updatedVariants: 0,
    createdAddonGroups: 0,
    createdAddonOptions: 0,
    linkedAddonGroups: 0,
    configuredMultisabor: 0,
  };
  await db.transaction(async (tx) => {
    const categories = await tx
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.storeId, storeId));
    const categoryByName = new Map(
      categories.map((c) => [normalizeHeader(c.name), c]),
    );
    for (const row of preview.validRows) {
      let category = categoryByName.get(normalizeHeader(row.category));
      if (!category) {
        [category] = await tx
          .insert(categoriesTable)
          .values({ storeId, name: row.category })
          .returning();
        categoryByName.set(normalizeHeader(category.name), category);
        summary.createdCategories++;
      }
      const [existingProduct] = await tx
        .select()
        .from(productsTable)
        .where(
          row.sku
            ? and(
                eq(productsTable.storeId, storeId),
                ilike(productsTable.sku, row.sku),
              )
            : and(
                eq(productsTable.storeId, storeId),
                eq(productsTable.categoryId, category.id),
                ilike(productsTable.name, row.product),
              ),
        )
        .limit(1);
      if (existingProduct && mode === "skip") {
        summary.skippedProducts++;
        continue;
      }
      const productData = {
        storeId,
        categoryId: category.id,
        name: row.product,
        description: row.description,
        price: String(row.price),
        sku: row.sku,
        barcode: row.barcode,
        costPrice: row.costPrice === null ? null : String(row.costPrice),
        unit: row.unit,
        preparationTimeMinutes: row.preparationTimeMinutes,
        trackStock: row.trackStock,
        stockQty: row.stockQty === null ? null : String(row.stockQty),
        stockMinQty: row.stockMinQty === null ? null : String(row.stockMinQty),
        allowSaleWithoutStock: row.allowSaleWithoutStock,
        available: row.available,
        active: row.active,
        imageUrl: row.imageUrl,
        imageAlt: row.imageAlt,
      };
      let product = existingProduct;
      if (product) {
        [product] = await tx
          .update(productsTable)
          .set(productData)
          .where(
            and(
              eq(productsTable.id, product.id),
              eq(productsTable.storeId, storeId),
            ),
          )
          .returning();
        summary.updatedProducts++;
      } else {
        [product] = await tx
          .insert(productsTable)
          .values(productData)
          .returning();
        summary.createdProducts++;
      }
      for (const [index, variant] of row.variants.entries()) {
        const [existing] = await tx
          .select()
          .from(productVariantsTable)
          .where(
            and(
              eq(productVariantsTable.storeId, storeId),
              eq(productVariantsTable.productId, product.id),
              ilike(productVariantsTable.name, variant.name),
            ),
          )
          .limit(1);
        if (existing) {
          await tx
            .update(productVariantsTable)
            .set({
              price: String(variant.price),
              available: true,
              active: true,
              updatedAt: new Date(),
            })
            .where(eq(productVariantsTable.id, existing.id));
          summary.updatedVariants++;
        } else {
          await tx.insert(productVariantsTable).values({
            storeId,
            productId: product.id,
            name: variant.name,
            price: String(variant.price),
            active: true,
            available: true,
            sortOrder: index,
          });
          summary.createdVariants++;
        }
      }

      for (const [configIndex, config] of row.pizzaConfigs.entries()) {
        let [size] = await tx
          .select()
          .from(pizzaSizesTable)
          .where(
            and(
              eq(pizzaSizesTable.storeId, storeId),
              ilike(pizzaSizesTable.name, config.size),
            ),
          )
          .limit(1);
        if (!size) {
          [size] = await tx
            .insert(pizzaSizesTable)
            .values({
              storeId,
              name: config.size,
              maxFlavors: config.maxFlavors,
              sortOrder: configIndex,
            })
            .returning();
        } else {
          await tx
            .update(pizzaSizesTable)
            .set({
              maxFlavors: config.maxFlavors,
              active: true,
              updatedAt: new Date(),
            })
            .where(eq(pizzaSizesTable.id, size.id));
        }

        let [tier] = await tx
          .select()
          .from(pizzaPriceTiersTable)
          .where(
            and(
              eq(pizzaPriceTiersTable.storeId, storeId),
              ilike(pizzaPriceTiersTable.name, config.classification),
            ),
          )
          .limit(1);
        if (!tier) {
          [tier] = await tx
            .insert(pizzaPriceTiersTable)
            .values({
              storeId,
              name: config.classification,
              sortOrder: configIndex,
            })
            .returning();
        }

        const [existingPrice] = await tx
          .select()
          .from(pizzaSizeTierPricesTable)
          .where(
            and(
              eq(pizzaSizeTierPricesTable.storeId, storeId),
              eq(pizzaSizeTierPricesTable.sizeId, size.id),
              eq(pizzaSizeTierPricesTable.tierId, tier.id),
            ),
          )
          .limit(1);
        if (existingPrice) {
          await tx
            .update(pizzaSizeTierPricesTable)
            .set({ price: String(config.price), updatedAt: new Date() })
            .where(eq(pizzaSizeTierPricesTable.id, existingPrice.id));
        } else {
          await tx.insert(pizzaSizeTierPricesTable).values({
            storeId,
            sizeId: size.id,
            tierId: tier.id,
            price: String(config.price),
          });
        }

        const [existingFlavor] = await tx
          .select()
          .from(pizzaFlavorsTable)
          .where(
            and(
              eq(pizzaFlavorsTable.storeId, storeId),
              eq(pizzaFlavorsTable.productId, product.id),
            ),
          )
          .limit(1);
        if (!existingFlavor) {
          await tx.insert(pizzaFlavorsTable).values({
            storeId,
            productId: product.id,
            tierId: tier.id,
            sortOrder: configIndex,
          });
        } else {
          await tx
            .update(pizzaFlavorsTable)
            .set({ tierId: tier.id, active: true, updatedAt: new Date() })
            .where(eq(pizzaFlavorsTable.id, existingFlavor.id));
        }
        summary.configuredMultisabor++;
      }
      for (const [groupIndex, group] of row.addons.entries()) {
        let [addonGroup] = await tx
          .select()
          .from(addonGroupsTable)
          .where(
            and(
              eq(addonGroupsTable.storeId, storeId),
              ilike(addonGroupsTable.name, group.name),
            ),
          )
          .limit(1);
        if (addonGroup) {
          [addonGroup] = await tx
            .update(addonGroupsTable)
            .set({
              required: group.required,
              minSelected: group.minSelected,
              maxSelected: group.maxSelected,
              active: true,
              updatedAt: new Date(),
            })
            .where(eq(addonGroupsTable.id, addonGroup.id))
            .returning();
        } else {
          [addonGroup] = await tx
            .insert(addonGroupsTable)
            .values({
              storeId,
              name: group.name,
              required: group.required,
              minSelected: group.minSelected,
              maxSelected: group.maxSelected,
              active: true,
              sortOrder: groupIndex,
            })
            .returning();
          summary.createdAddonGroups++;
        }
        for (const [optionIndex, option] of group.options.entries()) {
          const [existingOption] = await tx
            .select()
            .from(addonOptionsTable)
            .where(
              and(
                eq(addonOptionsTable.storeId, storeId),
                eq(addonOptionsTable.groupId, addonGroup.id),
                ilike(addonOptionsTable.name, option.name),
              ),
            )
            .limit(1);
          if (existingOption)
            await tx
              .update(addonOptionsTable)
              .set({
                price: String(option.price),
                available: true,
                updatedAt: new Date(),
              })
              .where(eq(addonOptionsTable.id, existingOption.id));
          else {
            await tx.insert(addonOptionsTable).values({
              storeId,
              groupId: addonGroup.id,
              name: option.name,
              price: String(option.price),
              available: true,
              sortOrder: optionIndex,
            });
            summary.createdAddonOptions++;
          }
        }
        const [existingLink] = await tx
          .select({ id: productAddonGroupsTable.id })
          .from(productAddonGroupsTable)
          .where(
            and(
              eq(productAddonGroupsTable.storeId, storeId),
              eq(productAddonGroupsTable.productId, product.id),
              eq(productAddonGroupsTable.addonGroupId, addonGroup.id),
            ),
          )
          .limit(1);
        if (!existingLink) {
          await tx.insert(productAddonGroupsTable).values({
            storeId,
            productId: product.id,
            addonGroupId: addonGroup.id,
            sortOrder: groupIndex,
          });
          summary.linkedAddonGroups++;
        }
      }
    }
  });
  res.json({ ok: true, summary, errors: [], warnings: preview.warnings });
});


const FULL_IMPORT_HEADERS = ["tipo_registro","categoria","produto","descricao","preco","sku","ativo","disponivel","tamanho","preco_tamanho","grupo_complemento","complemento","preco_complemento","obrigatorio","min_escolhas","max_escolhas","serve_quantas_pessoas","controlar_estoque","estoque_atual","estoque_minimo","vender_sem_estoque","tempo_preparo_min","unidade","grupo_multisabor","categoria_multisabor","tamanho_multisabor","min_sabores","max_sabores","classificacao","rank","preco_multisabor","produto_sabor","grupo_adicional","nome_etapa_quantidade","nome_opcoes","regra_preco","ordem","observacao_teste"];
type FullRow = Record<string, string> & { rowNumber: string; tipo_registro: string };
type FullCounters = { categorias: number; produtos: number; variacoes: number; gruposAdicionais: number; opcoesAdicionais: number; gruposMultisabor: number; tamanhosMultisabor: number; classificacoesMultisabor: number; precosMultisabor: number; saboresMultisabor: number; adicionaisMultisabor: number; erros: number };
const emptyFullCounters = (): FullCounters => ({ categorias: 0, produtos: 0, variacoes: 0, gruposAdicionais: 0, opcoesAdicionais: 0, gruposMultisabor: 0, tamanhosMultisabor: 0, classificacoesMultisabor: 0, precosMultisabor: 0, saboresMultisabor: 0, adicionaisMultisabor: 0, erros: 0 });
const fullCell = (r: FullRow, key: string) => String(r[key] ?? "").trim();
const fullKey = (v: string) => normalizeHeader(v);
function parseFullRows(csv: string) {
  const errors: ImportError[] = [];
  const parsed = parseCsv(csv || "");
  const headers = parsed[0]?.map(normalizeHeader) ?? [];
  const missing = ["tipo_registro"].filter((h) => !headers.includes(h));
  missing.forEach((h) => errors.push({ rowNumber: 1, field: h, message: `Coluna obrigatória ausente: ${h}.` }));
  const rows: FullRow[] = parsed.slice(1).map((raw, i) => {
    const obj: Record<string, string> = { rowNumber: String(i + 2) };
    headers.forEach((h, idx) => { obj[h] = raw[idx] ?? ""; });
    obj.tipo_registro = fullKey(obj.tipo_registro || "");
    return obj as FullRow;
  }).filter((r) => Object.keys(r).some((k) => k !== "rowNumber" && String(r[k]).trim()));
  return { rows, errors };
}
async function buildFullImportPreview(storeId: number, csv: string) {
  const { rows, errors } = parseFullRows(csv);
  const counters = emptyFullCounters();
  const previewRows: Array<{ rowNumber: number; tipo: string; resumo: string }> = [];
  const [cats, prods, addons, groups, sizes, classes] = await Promise.all([
    db.select().from(categoriesTable).where(eq(categoriesTable.storeId, storeId)),
    db.select().from(productsTable).where(eq(productsTable.storeId, storeId)),
    db.select().from(addonGroupsTable).where(eq(addonGroupsTable.storeId, storeId)),
    db.select().from(multiflavorGroupsTable).where(eq(multiflavorGroupsTable.storeId, storeId)),
    db.select({ id: multiflavorSizesTable.id, name: multiflavorSizesTable.name, groupName: multiflavorGroupsTable.name }).from(multiflavorSizesTable).innerJoin(multiflavorGroupsTable, eq(multiflavorSizesTable.groupId, multiflavorGroupsTable.id)).where(and(eq(multiflavorSizesTable.storeId, storeId), eq(multiflavorGroupsTable.storeId, storeId))),
    db.select({ id: multiflavorClassificationsTable.id, name: multiflavorClassificationsTable.name, groupName: multiflavorGroupsTable.name }).from(multiflavorClassificationsTable).innerJoin(multiflavorGroupsTable, eq(multiflavorClassificationsTable.groupId, multiflavorGroupsTable.id)).where(and(eq(multiflavorClassificationsTable.storeId, storeId), eq(multiflavorGroupsTable.storeId, storeId))),
  ]);
  const catNames = new Set(cats.map((c) => fullKey(c.name)));
  const prodNames = new Set(prods.map((p) => fullKey(p.name)));
  const skuNames = new Set(prods.map((p) => fullKey(p.sku ?? "")).filter(Boolean));
  const addonNames = new Set(addons.map((a) => fullKey(a.name)));
  const groupNames = new Set(groups.map((g) => fullKey(g.name)));
  const sizeNames = new Set(sizes.map((s) => `${fullKey(s.groupName)}|${fullKey(s.name)}`));
  const classNames = new Set(classes.map((c) => `${fullKey(c.groupName)}|${fullKey(c.name)}`));
  for (const r of rows) {
    const rn = Number(r.rowNumber), tipo = r.tipo_registro;
    const addErr = (field: string, message: string) => errors.push({ rowNumber: rn, field, message });
    if (tipo === "produto") { const cat = fullCell(r,"categoria"), prod = fullCell(r,"produto"), price = parseNumberValue(fullCell(r,"preco"), "preco", rn, errors, true, prod); if (!cat) addErr("categoria","categoria obrigatória."); if (!prod) addErr("produto","produto obrigatório."); if (cat) catNames.add(fullKey(cat)); if (prod) prodNames.add(fullKey(prod)); if (fullCell(r,"sku")) skuNames.add(fullKey(fullCell(r,"sku"))); if (price != null) counters.produtos++; if (cat) counters.categorias = new Set(rows.filter(x=>x.tipo_registro==='produto').map(x=>fullKey(fullCell(x,'categoria'))).filter(Boolean)).size; previewRows.push({ rowNumber: rn, tipo, resumo: `${cat} / ${prod}` }); }
    else if (tipo === "tamanho") { if (!fullCell(r,"produto") && !fullCell(r,"sku")) addErr("produto","produto ou sku obrigatório."); if (!fullCell(r,"tamanho")) addErr("tamanho","tamanho obrigatório."); parseNumberValue(fullCell(r,"preco_tamanho"), "preco_tamanho", rn, errors, true); counters.variacoes++; previewRows.push({ rowNumber: rn, tipo, resumo: fullCell(r,"tamanho") }); }
    else if (tipo === "complemento") { const g=fullCell(r,"grupo_complemento"), o=fullCell(r,"complemento"); if (!fullCell(r,"produto") && !fullCell(r,"sku")) addErr("produto","produto ou sku obrigatório."); if (!g) addErr("grupo_complemento","grupo obrigatório."); if (!o) addErr("complemento","complemento obrigatório."); parseNumberValue(fullCell(r,"preco_complemento") || "0", "preco_complemento", rn, errors); if (g) { addonNames.add(fullKey(g)); counters.gruposAdicionais = new Set(rows.filter(x=>x.tipo_registro==='complemento').map(x=>fullKey(fullCell(x,'grupo_complemento'))).filter(Boolean)).size; } counters.opcoesAdicionais++; previewRows.push({ rowNumber: rn, tipo, resumo: `${g} / ${o}` }); }
    else if (tipo === "grupo_multisabor") { const g=fullCell(r,"grupo_multisabor"), c=fullCell(r,"categoria_multisabor"); if (!g) addErr("grupo_multisabor","grupo Multisabor obrigatório."); if (c && !catNames.has(fullKey(c))) addErr("categoria_multisabor",`categoria "${c}" não encontrada nesta loja ou no CSV.`); if (g) groupNames.add(fullKey(g)); counters.gruposMultisabor++; previewRows.push({ rowNumber: rn, tipo, resumo: g }); }
    else if (tipo === "tamanho_multisabor") { const g=fullCell(r,"grupo_multisabor"), t=fullCell(r,"tamanho_multisabor"); if (!groupNames.has(fullKey(g))) addErr("grupo_multisabor",`grupo "${g}" não encontrado.`); if (!t) addErr("tamanho_multisabor","tamanho obrigatório."); const min=parseIntegerValue(fullCell(r,"min_sabores")||"1","min_sabores",rn,errors)??1, max=parseIntegerValue(fullCell(r,"max_sabores")||"1","max_sabores",rn,errors)??1; if (max < min) addErr("max_sabores","max_sabores menor que min_sabores."); if (g&&t) sizeNames.add(`${fullKey(g)}|${fullKey(t)}`); counters.tamanhosMultisabor++; previewRows.push({ rowNumber: rn, tipo, resumo: t }); }
    else if (tipo === "classificacao_multisabor") { const g=fullCell(r,"grupo_multisabor"), c=fullCell(r,"classificacao"); if (!groupNames.has(fullKey(g))) addErr("grupo_multisabor",`grupo "${g}" não encontrado.`); if (!c) addErr("classificacao","classificação obrigatória."); if (g&&c) classNames.add(`${fullKey(g)}|${fullKey(c)}`); counters.classificacoesMultisabor++; previewRows.push({ rowNumber: rn, tipo, resumo: c }); }
    else if (tipo === "preco_multisabor") { const g=fullCell(r,"grupo_multisabor"), t=fullCell(r,"tamanho_multisabor"), c=fullCell(r,"classificacao"); if (!sizeNames.has(`${fullKey(g)}|${fullKey(t)}`)) addErr("tamanho_multisabor",`tamanho "${t}" não encontrado.`); if (!classNames.has(`${fullKey(g)}|${fullKey(c)}`)) addErr("classificacao",`classificação "${c}" não encontrada.`); parseNumberValue(fullCell(r,"preco_multisabor"), "preco_multisabor", rn, errors, true); counters.precosMultisabor++; previewRows.push({ rowNumber: rn, tipo, resumo: `${t} / ${c}` }); }
    else if (tipo === "sabor_multisabor") { const g=fullCell(r,"grupo_multisabor"), p=fullCell(r,"produto_sabor"), c=fullCell(r,"classificacao"); if (!groupNames.has(fullKey(g))) addErr("grupo_multisabor",`grupo "${g}" não encontrado.`); if (!prodNames.has(fullKey(p))) addErr("produto_sabor",`produto "${p}" não encontrado nesta loja ou no CSV.`); if (!classNames.has(`${fullKey(g)}|${fullKey(c)}`)) addErr("classificacao",`classificação "${c}" não encontrada.`); counters.saboresMultisabor++; previewRows.push({ rowNumber: rn, tipo, resumo: p }); }
    else if (tipo === "adicional_multisabor") { const g=fullCell(r,"grupo_multisabor"), a=fullCell(r,"grupo_adicional"); if (!groupNames.has(fullKey(g))) addErr("grupo_multisabor",`grupo "${g}" não encontrado.`); if (!addonNames.has(fullKey(a))) addErr("grupo_adicional",`grupo de adicional "${a}" não encontrado nesta loja ou no CSV.`); counters.adicionaisMultisabor++; previewRows.push({ rowNumber: rn, tipo, resumo: a }); }
    else addErr("tipo_registro", `tipo_registro "${tipo}" inválido.`);
  }
  counters.erros = errors.length;
  return { ok: errors.length === 0, counters, errors, rows: previewRows, parsedRows: rows };
}


router.get("/menu/import-full-template", async (_req, res): Promise<void> => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="00_importacao_unica_cardapio_e_multisabor_gestor_max.csv"');
  res.send(toCsv([FULL_IMPORT_HEADERS]));
});
router.post("/menu/import-full-preview", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const preview = await buildFullImportPreview(actor.storeId, String(req.body?.csv ?? ""));
  res.status(preview.ok ? 200 : 400).json({ ok: preview.ok, counters: preview.counters, errors: preview.errors, rows: preview.rows });
});
router.post("/menu/import-full", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const preview = await buildFullImportPreview(actor.storeId, String(req.body?.csv ?? ""));
  if (!preview.ok) { res.status(400).json({ ok: false, counters: preview.counters, errors: preview.errors }); return; }
  await db.transaction(async (tx) => {
    const categoryMap = new Map((await tx.select().from(categoriesTable).where(eq(categoriesTable.storeId, actor.storeId))).map((x) => [fullKey(x.name), x]));
    const productMap = new Map<string, any>();
    const skuMap = new Map<string, any>();
    for (const p of await tx.select().from(productsTable).where(eq(productsTable.storeId, actor.storeId))) { productMap.set(fullKey(p.name), p); if (p.sku) skuMap.set(fullKey(p.sku), p); }
    const addonMap = new Map((await tx.select().from(addonGroupsTable).where(eq(addonGroupsTable.storeId, actor.storeId))).map((x) => [fullKey(x.name), x]));
    const groupMap = new Map((await tx.select().from(multiflavorGroupsTable).where(eq(multiflavorGroupsTable.storeId, actor.storeId))).map((x) => [fullKey(x.name), x]));
    const sizeMap = new Map<string, any>(); const classMap = new Map<string, any>();
    const findProduct = (r: FullRow) => fullCell(r,"sku") ? skuMap.get(fullKey(fullCell(r,"sku"))) : productMap.get(fullKey(fullCell(r,"produto") || fullCell(r,"produto_sabor")));
    for (const r of preview.parsedRows.filter((x) => x.tipo_registro === "produto")) {
      let cat = categoryMap.get(fullKey(fullCell(r,"categoria"))); if (!cat) { [cat] = await tx.insert(categoriesTable).values({ storeId: actor.storeId, name: fullCell(r,"categoria") }).returning(); categoryMap.set(fullKey(cat.name), cat); }
      const values = { storeId: actor.storeId, categoryId: cat.id, name: fullCell(r,"produto"), description: fullCell(r,"descricao") || null, price: String(normalizePriceValue(fullCell(r,"preco")).value ?? 0), sku: fullCell(r,"sku") || null, active: parseBooleanValue(fullCell(r,"ativo"), true), available: parseBooleanValue(fullCell(r,"disponivel"), true), trackStock: parseBooleanValue(fullCell(r,"controlar_estoque"), false), stockQty: fullCell(r,"estoque_atual") || null, stockMinQty: fullCell(r,"estoque_minimo") || null, allowSaleWithoutStock: parseBooleanValue(fullCell(r,"vender_sem_estoque"), true), preparationTimeMinutes: Number(fullCell(r,"tempo_preparo_min") || 0) || null, unit: fullCell(r,"unidade") || "unidade" };
      let prod = fullCell(r,"sku") ? skuMap.get(fullKey(fullCell(r,"sku"))) : undefined; if (!prod) prod = productMap.get(fullKey(values.name));
      if (prod) [prod] = await tx.update(productsTable).set({ categoryId: values.categoryId, name: values.name, description: values.description, price: values.price, sku: values.sku, active: values.active, available: values.available, trackStock: values.trackStock, stockQty: values.stockQty, stockMinQty: values.stockMinQty, allowSaleWithoutStock: values.allowSaleWithoutStock, preparationTimeMinutes: values.preparationTimeMinutes, unit: values.unit }).where(and(eq(productsTable.storeId, actor.storeId), eq(productsTable.id, prod.id))).returning(); else [prod] = await tx.insert(productsTable).values(values).returning();
      productMap.set(fullKey(prod.name), prod); if (prod.sku) skuMap.set(fullKey(prod.sku), prod);
    }
    for (const r of preview.parsedRows.filter((x) => x.tipo_registro === "tamanho")) { const p = findProduct(r); const name = fullCell(r,"tamanho"); const [old] = await tx.select().from(productVariantsTable).where(and(eq(productVariantsTable.storeId, actor.storeId), eq(productVariantsTable.productId, p.id), ilike(productVariantsTable.name, name))).limit(1); const vals = { price: String(normalizePriceValue(fullCell(r,"preco_tamanho")).value ?? 0), active: true, available: true, updatedAt: new Date() }; if (old) await tx.update(productVariantsTable).set(vals).where(eq(productVariantsTable.id, old.id)); else await tx.insert(productVariantsTable).values({ storeId: actor.storeId, productId: p.id, name, price: vals.price, active: true, available: true }); }
    for (const r of preview.parsedRows.filter((x) => x.tipo_registro === "complemento")) { const p = findProduct(r); const gname = fullCell(r,"grupo_complemento"); let g = addonMap.get(fullKey(gname)); const gvals = { required: parseBooleanValue(fullCell(r,"obrigatorio"), false), minSelected: Number(fullCell(r,"min_escolhas") || 0), maxSelected: fullCell(r,"max_escolhas") ? Number(fullCell(r,"max_escolhas")) : null, active: true, updatedAt: new Date() }; if (g) [g] = await tx.update(addonGroupsTable).set(gvals).where(eq(addonGroupsTable.id, g.id)).returning(); else [g] = await tx.insert(addonGroupsTable).values({ storeId: actor.storeId, name: gname, ...gvals }).returning(); addonMap.set(fullKey(g.name), g); const oname=fullCell(r,"complemento"); const [oldOpt]=await tx.select().from(addonOptionsTable).where(and(eq(addonOptionsTable.storeId, actor.storeId), eq(addonOptionsTable.groupId, g.id), ilike(addonOptionsTable.name,oname))).limit(1); const price=String(normalizePriceValue(fullCell(r,"preco_complemento")||"0").value ?? 0); if (oldOpt) await tx.update(addonOptionsTable).set({ price, available: true, updatedAt: new Date() }).where(eq(addonOptionsTable.id, oldOpt.id)); else await tx.insert(addonOptionsTable).values({ storeId: actor.storeId, groupId: g.id, name: oname, price, available: true }); await tx.insert(productAddonGroupsTable).values({ storeId: actor.storeId, productId: p.id, addonGroupId: g.id }).onConflictDoNothing(); }
    for (const r of preview.parsedRows.filter((x) => x.tipo_registro === "grupo_multisabor")) { const cname=fullCell(r,"categoria_multisabor"), cat=cname?categoryMap.get(fullKey(cname)):null, name=fullCell(r,"grupo_multisabor"), old=groupMap.get(fullKey(name)); const vals={ categoryId: cat?.id ?? null, quantityStepLabel: fullCell(r,"nome_etapa_quantidade") || "Quantidade de sabores", optionsStepLabel: fullCell(r,"nome_opcoes") || "Sabores", pricingMode: "highest_classification", active: parseBooleanValue(fullCell(r,"ativo"), true), available: parseBooleanValue(fullCell(r,"ativo"), true), sortOrder: Number(fullCell(r,"ordem")||0), updatedAt: new Date() }; let row; if (old) [row]=await tx.update(multiflavorGroupsTable).set(vals).where(eq(multiflavorGroupsTable.id, old.id)).returning(); else [row]=await tx.insert(multiflavorGroupsTable).values({ storeId: actor.storeId, name, ...vals }).returning(); groupMap.set(fullKey(row.name), row); }
    for (const s of await tx.select({ id: multiflavorSizesTable.id, name: multiflavorSizesTable.name, groupName: multiflavorGroupsTable.name }).from(multiflavorSizesTable).innerJoin(multiflavorGroupsTable, eq(multiflavorSizesTable.groupId, multiflavorGroupsTable.id)).where(eq(multiflavorSizesTable.storeId, actor.storeId))) sizeMap.set(`${fullKey(s.groupName)}|${fullKey(s.name)}`, s);
    for (const c of await tx.select({ id: multiflavorClassificationsTable.id, name: multiflavorClassificationsTable.name, groupName: multiflavorGroupsTable.name }).from(multiflavorClassificationsTable).innerJoin(multiflavorGroupsTable, eq(multiflavorClassificationsTable.groupId, multiflavorGroupsTable.id)).where(eq(multiflavorClassificationsTable.storeId, actor.storeId))) classMap.set(`${fullKey(c.groupName)}|${fullKey(c.name)}`, c);
    for (const r of preview.parsedRows.filter((x) => x.tipo_registro === "tamanho_multisabor")) { const g=groupMap.get(fullKey(fullCell(r,"grupo_multisabor")))!, name=fullCell(r,"tamanho_multisabor"), key=`${fullKey(g.name)}|${fullKey(name)}`, old=sizeMap.get(key); const vals={ minFlavors:Number(fullCell(r,"min_sabores")||1), maxFlavors:Number(fullCell(r,"max_sabores")||1), active:parseBooleanValue(fullCell(r,"ativo"),true), available:parseBooleanValue(fullCell(r,"ativo"),true), sortOrder:Number(fullCell(r,"ordem")||0), updatedAt:new Date() }; let row; if(old)[row]=await tx.update(multiflavorSizesTable).set(vals).where(eq(multiflavorSizesTable.id,old.id)).returning(); else [row]=await tx.insert(multiflavorSizesTable).values({storeId:actor.storeId,groupId:g.id,name,...vals}).returning(); sizeMap.set(key,row); }
    for (const r of preview.parsedRows.filter((x) => x.tipo_registro === "classificacao_multisabor")) { const g=groupMap.get(fullKey(fullCell(r,"grupo_multisabor")))!, name=fullCell(r,"classificacao"), key=`${fullKey(g.name)}|${fullKey(name)}`, old=classMap.get(key); const vals={ rank:Number(fullCell(r,"rank")||0), active:parseBooleanValue(fullCell(r,"ativo"),true), sortOrder:Number(fullCell(r,"ordem")||0), updatedAt:new Date() }; let row; if(old)[row]=await tx.update(multiflavorClassificationsTable).set(vals).where(eq(multiflavorClassificationsTable.id,old.id)).returning(); else [row]=await tx.insert(multiflavorClassificationsTable).values({storeId:actor.storeId,groupId:g.id,name,...vals}).returning(); classMap.set(key,row); }
    for (const r of preview.parsedRows.filter((x) => x.tipo_registro === "preco_multisabor")) { const g=groupMap.get(fullKey(fullCell(r,"grupo_multisabor")))!, sz=sizeMap.get(`${fullKey(g.name)}|${fullKey(fullCell(r,"tamanho_multisabor"))}`), cl=classMap.get(`${fullKey(g.name)}|${fullKey(fullCell(r,"classificacao"))}`); await tx.insert(multiflavorSizeClassificationPricesTable).values({ storeId:actor.storeId, groupId:g.id, sizeId:sz!.id, classificationId:cl!.id, price:String(normalizePriceValue(fullCell(r,"preco_multisabor")).value ?? 0) }).onConflictDoUpdate({ target:[multiflavorSizeClassificationPricesTable.storeId,multiflavorSizeClassificationPricesTable.sizeId,multiflavorSizeClassificationPricesTable.classificationId], set:{ groupId:g.id, price:String(normalizePriceValue(fullCell(r,"preco_multisabor")).value ?? 0), updatedAt:new Date() } }); }
    for (const r of preview.parsedRows.filter((x) => x.tipo_registro === "sabor_multisabor")) { const g=groupMap.get(fullKey(fullCell(r,"grupo_multisabor")))!, p=productMap.get(fullKey(fullCell(r,"produto_sabor"))), cl=classMap.get(`${fullKey(g.name)}|${fullKey(fullCell(r,"classificacao"))}`); await tx.insert(multiflavorFlavorsTable).values({ storeId:actor.storeId, groupId:g.id, productId:p!.id, classificationId:cl!.id, active:parseBooleanValue(fullCell(r,"ativo"),true), available:parseBooleanValue(fullCell(r,"ativo"),true), sortOrder:Number(fullCell(r,"ordem")||0) }).onConflictDoUpdate({ target:[multiflavorFlavorsTable.storeId,multiflavorFlavorsTable.groupId,multiflavorFlavorsTable.productId], set:{ classificationId:cl!.id, active:parseBooleanValue(fullCell(r,"ativo"),true), available:parseBooleanValue(fullCell(r,"ativo"),true), sortOrder:Number(fullCell(r,"ordem")||0), updatedAt:new Date() } }); }
    for (const r of preview.parsedRows.filter((x) => x.tipo_registro === "adicional_multisabor")) { const g=groupMap.get(fullKey(fullCell(r,"grupo_multisabor")))!, a=addonMap.get(fullKey(fullCell(r,"grupo_adicional"))); await tx.insert(multiflavorGroupAddonGroupsTable).values({ storeId:actor.storeId, groupId:g.id, addonGroupId:a!.id, sortOrder:Number(fullCell(r,"ordem")||0) }).onConflictDoUpdate({ target:[multiflavorGroupAddonGroupsTable.storeId,multiflavorGroupAddonGroupsTable.groupId,multiflavorGroupAddonGroupsTable.addonGroupId], set:{ sortOrder:Number(fullCell(r,"ordem")||0) } }); }
  });
  res.json({ ok: true, counters: preview.counters });
});

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

// ─── Add-ons ────────────────────────────────────────────────────────────────

type AddonGroupBody = {
  name?: string;
  description?: string | null;
  required?: boolean;
  minSelected?: number;
  maxSelected?: number | null;
  active?: boolean;
  sortOrder?: number;
};

type AddonOptionBody = {
  name?: string;
  price?: number;
  available?: boolean;
  sortOrder?: number;
};

function isMissingAddonTableError(error: unknown): boolean {
  const dbError = error as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown };
  } | null;
  const code = dbError?.code ?? dbError?.cause?.code;
  const message = String(
    dbError?.message ?? dbError?.cause?.message ?? "",
  ).toLowerCase();

  return (
    code === "42P01" ||
    (message.includes("relation") &&
      message.includes("addon_groups") &&
      message.includes("does not exist"))
  );
}

function parseAddonGroupBody(body: AddonGroupBody, partial = false) {
  const data: Record<string, unknown> = {};
  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) return { error: "Nome do grupo é obrigatório." };
    data.name = body.name.trim();
  }
  if (body.description !== undefined)
    data.description = body.description?.trim() || null;
  if (body.required !== undefined) data.required = body.required;
  if (body.minSelected !== undefined) {
    if (!Number.isInteger(body.minSelected) || body.minSelected < 0)
      return { error: "Mínimo deve ser inteiro e >= 0." };
    data.minSelected = body.minSelected;
  } else if (!partial) data.minSelected = 0;
  if (body.maxSelected !== undefined) {
    if (
      body.maxSelected !== null &&
      (!Number.isInteger(body.maxSelected) || body.maxSelected < 0)
    )
      return { error: "Máximo deve ser inteiro, >= 0 ou nulo." };
    data.maxSelected = body.maxSelected;
  }
  if (body.active !== undefined) data.active = body.active;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  const min = Number(data.minSelected ?? body.minSelected ?? 0);
  const max = data.maxSelected as number | null | undefined;
  if (max != null && min > max)
    return { error: "Mínimo não pode ser maior que o máximo." };
  return { data };
}

const serializeAddonOption = (
  option: typeof addonOptionsTable.$inferSelect,
) => ({
  ...option,
  price: parseFloat(String(option.price)),
});

const serializeAddonGroup = (
  group: typeof addonGroupsTable.$inferSelect,
  options: Array<typeof addonOptionsTable.$inferSelect> = [],
) => ({
  ...group,
  options: options.map(serializeAddonOption),
});

router.get("/menu/addon-groups", async (req, res): Promise<void> => {
  const { storeId } = await getCurrentActor(req);
  const groups = await db
    .select()
    .from(addonGroupsTable)
    .where(eq(addonGroupsTable.storeId, storeId))
    .orderBy(addonGroupsTable.sortOrder, addonGroupsTable.name);
  const options = groups.length
    ? await db
        .select()
        .from(addonOptionsTable)
        .where(
          and(
            eq(addonOptionsTable.storeId, storeId),
            inArray(
              addonOptionsTable.groupId,
              groups.map((g) => g.id),
            ),
          ),
        )
        .orderBy(addonOptionsTable.sortOrder, addonOptionsTable.id)
    : [];
  res.json(
    groups.map((g) =>
      serializeAddonGroup(
        g,
        options.filter((o) => o.groupId === g.id),
      ),
    ),
  );
});

router.post("/menu/addon-groups", async (req, res): Promise<void> => {
  try {
    const { storeId } = await getCurrentActor(req);
    const parsed = parseAddonGroupBody(req.body as AddonGroupBody);
    if ("error" in parsed)
      return void res.status(400).json({ error: parsed.error });
    const [created] = await db
      .insert(addonGroupsTable)
      .values({
        ...parsed.data,
        storeId,
      } as typeof addonGroupsTable.$inferInsert)
      .returning();
    res.status(201).json(serializeAddonGroup(created));
  } catch (error) {
    console.error("Erro ao criar grupo de adicionais", error);
    if (isMissingAddonTableError(error)) {
      res.status(500).json({
        error:
          "Banco de dados ainda não está atualizado. Rode a migration dos adicionais.",
      });
      return;
    }

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Erro ao criar grupo de adicionais.",
    });
  }
});

router.patch("/menu/addon-groups/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return void res.status(400).json({ error: "ID inválido." });
  const { storeId } = await getCurrentActor(req);
  const parsed = parseAddonGroupBody(req.body as AddonGroupBody, true);
  if ("error" in parsed)
    return void res.status(400).json({ error: parsed.error });
  const [updated] = await db
    .update(addonGroupsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(eq(addonGroupsTable.id, id), eq(addonGroupsTable.storeId, storeId)),
    )
    .returning();
  if (!updated)
    return void res
      .status(404)
      .json({ error: "Grupo de adicionais não encontrado." });
  const options = await db
    .select()
    .from(addonOptionsTable)
    .where(
      and(
        eq(addonOptionsTable.groupId, id),
        eq(addonOptionsTable.storeId, storeId),
      ),
    )
    .orderBy(addonOptionsTable.sortOrder, addonOptionsTable.id);
  res.json(serializeAddonGroup(updated, options));
});

router.get(
  "/menu/addon-groups/:id/options",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return void res.status(400).json({ error: "ID inválido." });
    const { storeId } = await getCurrentActor(req);
    const [group] = await db
      .select({ id: addonGroupsTable.id })
      .from(addonGroupsTable)
      .where(
        and(eq(addonGroupsTable.id, id), eq(addonGroupsTable.storeId, storeId)),
      )
      .limit(1);
    if (!group)
      return void res
        .status(404)
        .json({ error: "Grupo de adicionais não encontrado." });
    const options = await db
      .select()
      .from(addonOptionsTable)
      .where(
        and(
          eq(addonOptionsTable.groupId, id),
          eq(addonOptionsTable.storeId, storeId),
        ),
      )
      .orderBy(addonOptionsTable.sortOrder, addonOptionsTable.id);
    res.json(options.map(serializeAddonOption));
  },
);

router.post(
  "/menu/addon-groups/:id/options",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return void res.status(400).json({ error: "ID inválido." });
    const { storeId } = await getCurrentActor(req);
    const [group] = await db
      .select({ id: addonGroupsTable.id })
      .from(addonGroupsTable)
      .where(
        and(eq(addonGroupsTable.id, id), eq(addonGroupsTable.storeId, storeId)),
      )
      .limit(1);
    if (!group)
      return void res
        .status(404)
        .json({ error: "Grupo de adicionais não encontrado." });
    const body = req.body as AddonOptionBody;
    if (!body.name?.trim())
      return void res
        .status(400)
        .json({ error: "Nome da opção é obrigatório." });
    if (
      typeof body.price !== "number" ||
      !Number.isFinite(body.price) ||
      body.price < 0
    )
      return void res
        .status(400)
        .json({ error: "Preço deve ser numérico e >= 0." });
    const [created] = await db
      .insert(addonOptionsTable)
      .values({
        storeId,
        groupId: id,
        name: body.name.trim(),
        price: String(body.price),
        available: body.available ?? true,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();
    res.status(201).json(serializeAddonOption(created));
  },
);

router.patch("/menu/addon-options/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return void res.status(400).json({ error: "ID inválido." });
  const { storeId } = await getCurrentActor(req);
  const body = req.body as AddonOptionBody;
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    if (!body.name.trim())
      return void res
        .status(400)
        .json({ error: "Nome da opção é obrigatório." });
    data.name = body.name.trim();
  }
  if (body.price !== undefined) {
    if (
      typeof body.price !== "number" ||
      !Number.isFinite(body.price) ||
      body.price < 0
    )
      return void res
        .status(400)
        .json({ error: "Preço deve ser numérico e >= 0." });
    data.price = String(body.price);
  }
  if (body.available !== undefined) data.available = body.available;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  const [updated] = await db
    .update(addonOptionsTable)
    .set(data)
    .where(
      and(eq(addonOptionsTable.id, id), eq(addonOptionsTable.storeId, storeId)),
    )
    .returning();
  if (!updated)
    return void res
      .status(404)
      .json({ error: "Opção de adicional não encontrada." });
  res.json(serializeAddonOption(updated));
});

router.get(
  "/menu/products/:id/addon-groups",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return void res.status(400).json({ error: "ID inválido." });
    const { storeId } = await getCurrentActor(req);
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.storeId, storeId)))
      .limit(1);
    if (!product)
      return void res.status(404).json({ error: "Produto não encontrado." });
    const links = await db
      .select({
        sortOrder: productAddonGroupsTable.sortOrder,
        group: addonGroupsTable,
      })
      .from(productAddonGroupsTable)
      .innerJoin(
        addonGroupsTable,
        eq(productAddonGroupsTable.addonGroupId, addonGroupsTable.id),
      )
      .where(
        and(
          eq(productAddonGroupsTable.productId, id),
          eq(productAddonGroupsTable.storeId, storeId),
          eq(addonGroupsTable.storeId, storeId),
        ),
      )
      .orderBy(productAddonGroupsTable.sortOrder, addonGroupsTable.name);
    const groups = links.map((l) => l.group);
    const options = groups.length
      ? await db
          .select()
          .from(addonOptionsTable)
          .where(
            and(
              eq(addonOptionsTable.storeId, storeId),
              inArray(
                addonOptionsTable.groupId,
                groups.map((g) => g.id),
              ),
            ),
          )
          .orderBy(addonOptionsTable.sortOrder, addonOptionsTable.id)
      : [];
    res.json(
      groups.map((g) =>
        serializeAddonGroup(
          g,
          options.filter((o) => o.groupId === g.id),
        ),
      ),
    );
  },
);

router.put(
  "/menu/products/:id/addon-groups",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return void res.status(400).json({ error: "ID inválido." });
    const { storeId } = await getCurrentActor(req);
    const groupIds = Array.isArray(
      (req.body as { addonGroupIds?: unknown }).addonGroupIds,
    )
      ? (req.body as { addonGroupIds: unknown[] }).addonGroupIds.map(Number)
      : [];
    if (groupIds.some((gid) => !Number.isInteger(gid) || gid <= 0))
      return void res.status(400).json({ error: "Lista de grupos inválida." });
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.storeId, storeId)))
      .limit(1);
    if (!product)
      return void res.status(404).json({ error: "Produto não encontrado." });
    const uniqueIds = [...new Set(groupIds)];
    if (uniqueIds.length) {
      const groups = await db
        .select({ id: addonGroupsTable.id })
        .from(addonGroupsTable)
        .where(
          and(
            eq(addonGroupsTable.storeId, storeId),
            inArray(addonGroupsTable.id, uniqueIds),
          ),
        );
      if (groups.length !== uniqueIds.length)
        return void res
          .status(400)
          .json({ error: "Todos os grupos devem pertencer à loja atual." });
    }
    await db
      .delete(productAddonGroupsTable)
      .where(
        and(
          eq(productAddonGroupsTable.productId, id),
          eq(productAddonGroupsTable.storeId, storeId),
        ),
      );
    if (uniqueIds.length) {
      await db.insert(productAddonGroupsTable).values(
        uniqueIds.map((addonGroupId, index) => ({
          storeId,
          productId: id,
          addonGroupId,
          sortOrder: index,
        })),
      );
    }
    const groups = uniqueIds.length
      ? await db
          .select()
          .from(addonGroupsTable)
          .where(
            and(
              eq(addonGroupsTable.storeId, storeId),
              inArray(addonGroupsTable.id, uniqueIds),
            ),
          )
          .orderBy(addonGroupsTable.name)
      : [];
    res.json(groups.map((g) => serializeAddonGroup(g)));
  },
);

function pizzaNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

router.get("/menu/pizza/sizes", async (req, res) => {
  const actor = await getCurrentActor(req);
  res.json(
    await db
      .select()
      .from(pizzaSizesTable)
      .where(eq(pizzaSizesTable.storeId, actor.storeId))
      .orderBy(asc(pizzaSizesTable.sortOrder), asc(pizzaSizesTable.name)),
  );
});
router.post("/menu/pizza/sizes", async (req, res) => {
  const actor = await getCurrentActor(req);
  const maxFlavors = Number(req.body.maxFlavors ?? 1);
  if (!req.body.name || !Number.isInteger(maxFlavors) || maxFlavors < 1) {
    res.status(400).json({ error: "Informe nome e máximo de sabores válido." });
    return;
  }
  const [row] = await db
    .insert(pizzaSizesTable)
    .values({
      storeId: actor.storeId,
      name: String(req.body.name),
      maxFlavors,
      active: req.body.active ?? true,
      sortOrder: Number(req.body.sortOrder ?? 0),
    })
    .returning();
  res.status(201).json(row);
});
router.patch("/menu/pizza/sizes/:id", async (req, res) => {
  const actor = await getCurrentActor(req);
  const id = Number(req.params.id);
  const patch: any = { updatedAt: new Date() };
  if (req.body.name !== undefined) patch.name = String(req.body.name);
  if (req.body.maxFlavors !== undefined) {
    const n = Number(req.body.maxFlavors);
    if (!Number.isInteger(n) || n < 1) {
      res.status(400).json({ error: "Máximo de sabores inválido." });
      return;
    }
    patch.maxFlavors = n;
  }
  if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
  if (req.body.sortOrder !== undefined)
    patch.sortOrder = Number(req.body.sortOrder);
  const [row] = await db
    .update(pizzaSizesTable)
    .set(patch)
    .where(
      and(
        eq(pizzaSizesTable.id, id),
        eq(pizzaSizesTable.storeId, actor.storeId),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Tamanho não encontrado." });
    return;
  }
  res.json(row);
});
router.get("/menu/pizza/tiers", async (req, res) => {
  const actor = await getCurrentActor(req);
  res.json(
    await db
      .select()
      .from(pizzaPriceTiersTable)
      .where(eq(pizzaPriceTiersTable.storeId, actor.storeId))
      .orderBy(
        asc(pizzaPriceTiersTable.sortOrder),
        asc(pizzaPriceTiersTable.name),
      ),
  );
});
router.post("/menu/pizza/tiers", async (req, res) => {
  const actor = await getCurrentActor(req);
  if (!req.body.name) {
    res.status(400).json({ error: "Informe o nome da classificação." });
    return;
  }
  const [row] = await db
    .insert(pizzaPriceTiersTable)
    .values({
      storeId: actor.storeId,
      name: String(req.body.name),
      active: req.body.active ?? true,
      sortOrder: Number(req.body.sortOrder ?? 0),
    })
    .returning();
  res.status(201).json(row);
});
router.patch("/menu/pizza/tiers/:id", async (req, res) => {
  const actor = await getCurrentActor(req);
  const id = Number(req.params.id);
  const patch: any = { updatedAt: new Date() };
  if (req.body.name !== undefined) patch.name = String(req.body.name);
  if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
  if (req.body.sortOrder !== undefined)
    patch.sortOrder = Number(req.body.sortOrder);
  const [row] = await db
    .update(pizzaPriceTiersTable)
    .set(patch)
    .where(
      and(
        eq(pizzaPriceTiersTable.id, id),
        eq(pizzaPriceTiersTable.storeId, actor.storeId),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Classificação não encontrada." });
    return;
  }
  res.json(row);
});
router.get("/menu/pizza/prices", async (req, res) => {
  const actor = await getCurrentActor(req);
  res.json(
    await db
      .select()
      .from(pizzaSizeTierPricesTable)
      .where(eq(pizzaSizeTierPricesTable.storeId, actor.storeId)),
  );
});
router.put("/menu/pizza/prices", async (req, res) => {
  const actor = await getCurrentActor(req);
  const entries = Array.isArray(req.body.prices) ? req.body.prices : [];
  const saved = [];
  for (const entry of entries) {
    const sizeId = Number(entry.sizeId),
      tierId = Number(entry.tierId),
      price = pizzaNumber(entry.price);
    if (!sizeId || !tierId || price == null || price < 0) {
      res.status(400).json({ error: "Preço inválido." });
      return;
    }
    const [size] = await db
      .select({ id: pizzaSizesTable.id })
      .from(pizzaSizesTable)
      .where(
        and(
          eq(pizzaSizesTable.id, sizeId),
          eq(pizzaSizesTable.storeId, actor.storeId),
        ),
      )
      .limit(1);
    const [tier] = await db
      .select({ id: pizzaPriceTiersTable.id })
      .from(pizzaPriceTiersTable)
      .where(
        and(
          eq(pizzaPriceTiersTable.id, tierId),
          eq(pizzaPriceTiersTable.storeId, actor.storeId),
        ),
      )
      .limit(1);
    if (!size || !tier) {
      res
        .status(400)
        .json({ error: "Tamanho ou classificação não pertence à loja." });
      return;
    }
    const [row] = await db
      .insert(pizzaSizeTierPricesTable)
      .values({ storeId: actor.storeId, sizeId, tierId, price: String(price) })
      .onConflictDoUpdate({
        target: [
          pizzaSizeTierPricesTable.storeId,
          pizzaSizeTierPricesTable.sizeId,
          pizzaSizeTierPricesTable.tierId,
        ],
        set: { price: String(price), updatedAt: new Date() },
      })
      .returning();
    saved.push(row);
  }
  res.json(saved);
});
router.get("/menu/pizza/flavors", async (req, res) => {
  const actor = await getCurrentActor(req);
  const rows = await db
    .select({
      id: pizzaFlavorsTable.id,
      storeId: pizzaFlavorsTable.storeId,
      productId: pizzaFlavorsTable.productId,
      productName: productsTable.name,
      tierId: pizzaFlavorsTable.tierId,
      tierName: pizzaPriceTiersTable.name,
      active: pizzaFlavorsTable.active,
      sortOrder: pizzaFlavorsTable.sortOrder,
    })
    .from(pizzaFlavorsTable)
    .innerJoin(productsTable, eq(pizzaFlavorsTable.productId, productsTable.id))
    .innerJoin(
      pizzaPriceTiersTable,
      eq(pizzaFlavorsTable.tierId, pizzaPriceTiersTable.id),
    )
    .where(
      and(
        eq(pizzaFlavorsTable.storeId, actor.storeId),
        eq(productsTable.storeId, actor.storeId),
        eq(pizzaPriceTiersTable.storeId, actor.storeId),
      ),
    )
    .orderBy(asc(pizzaFlavorsTable.sortOrder), asc(productsTable.name));
  res.json(rows);
});
async function validatePizzaFlavor(
  actorStoreId: number,
  productId: number,
  tierId: number,
) {
  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.storeId, actorStoreId),
      ),
    )
    .limit(1);
  const [tier] = await db
    .select({ id: pizzaPriceTiersTable.id })
    .from(pizzaPriceTiersTable)
    .where(
      and(
        eq(pizzaPriceTiersTable.id, tierId),
        eq(pizzaPriceTiersTable.storeId, actorStoreId),
      ),
    )
    .limit(1);
  return Boolean(product && tier);
}
router.post("/menu/pizza/flavors", async (req, res) => {
  const actor = await getCurrentActor(req);
  const productId = Number(req.body.productId),
    tierId = Number(req.body.tierId);
  if (!(await validatePizzaFlavor(actor.storeId, productId, tierId))) {
    res
      .status(400)
      .json({ error: "Produto ou classificação inválida para esta loja." });
    return;
  }
  const [row] = await db
    .insert(pizzaFlavorsTable)
    .values({
      storeId: actor.storeId,
      productId,
      tierId,
      active: req.body.active ?? true,
      sortOrder: Number(req.body.sortOrder ?? 0),
    })
    .onConflictDoUpdate({
      target: [pizzaFlavorsTable.storeId, pizzaFlavorsTable.productId],
      set: {
        tierId,
        active: req.body.active ?? true,
        sortOrder: Number(req.body.sortOrder ?? 0),
        updatedAt: new Date(),
      },
    })
    .returning();
  res.status(201).json(row);
});
router.patch("/menu/pizza/flavors/:id", async (req, res) => {
  const actor = await getCurrentActor(req);
  const id = Number(req.params.id);
  const [old] = await db
    .select()
    .from(pizzaFlavorsTable)
    .where(
      and(
        eq(pizzaFlavorsTable.id, id),
        eq(pizzaFlavorsTable.storeId, actor.storeId),
      ),
    )
    .limit(1);
  if (!old) {
    res.status(404).json({ error: "Sabor não encontrado." });
    return;
  }
  const productId =
      req.body.productId !== undefined
        ? Number(req.body.productId)
        : old.productId,
    tierId =
      req.body.tierId !== undefined ? Number(req.body.tierId) : old.tierId;
  if (!(await validatePizzaFlavor(actor.storeId, productId, tierId))) {
    res
      .status(400)
      .json({ error: "Produto ou classificação inválida para esta loja." });
    return;
  }
  const [row] = await db
    .update(pizzaFlavorsTable)
    .set({
      productId,
      tierId,
      active: req.body.active ?? old.active,
      sortOrder:
        req.body.sortOrder !== undefined
          ? Number(req.body.sortOrder)
          : old.sortOrder,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pizzaFlavorsTable.id, id),
        eq(pizzaFlavorsTable.storeId, actor.storeId),
      ),
    )
    .returning();
  res.json(row);
});
router.delete("/menu/pizza/flavors/:id", async (req, res) => {
  const actor = await getCurrentActor(req);
  const deleted = await db
    .delete(pizzaFlavorsTable)
    .where(
      and(
        eq(pizzaFlavorsTable.id, Number(req.params.id)),
        eq(pizzaFlavorsTable.storeId, actor.storeId),
      ),
    )
    .returning({ id: pizzaFlavorsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Sabor não encontrado." });
    return;
  }
  res.status(204).end();
});

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function ensureMultiflavorGroup(storeId: number, groupId: number) {
  const [group] = await db
    .select({ id: multiflavorGroupsTable.id })
    .from(multiflavorGroupsTable)
    .where(
      and(
        eq(multiflavorGroupsTable.storeId, storeId),
        eq(multiflavorGroupsTable.id, groupId),
      ),
    )
    .limit(1);
  return group;
}

async function ensureMultiflavorSize(
  storeId: number,
  groupId: number,
  sizeId: number,
) {
  const [size] = await db
    .select({ id: multiflavorSizesTable.id })
    .from(multiflavorSizesTable)
    .where(
      and(
        eq(multiflavorSizesTable.storeId, storeId),
        eq(multiflavorSizesTable.groupId, groupId),
        eq(multiflavorSizesTable.id, sizeId),
      ),
    )
    .limit(1);
  return size;
}

async function ensureMultiflavorClassification(
  storeId: number,
  groupId: number,
  classificationId: number,
) {
  const [classification] = await db
    .select({ id: multiflavorClassificationsTable.id })
    .from(multiflavorClassificationsTable)
    .where(
      and(
        eq(multiflavorClassificationsTable.storeId, storeId),
        eq(multiflavorClassificationsTable.groupId, groupId),
        eq(multiflavorClassificationsTable.id, classificationId),
      ),
    )
    .limit(1);
  return classification;
}


type MultisaborImportPreview = {
  counters: { grupos: number; tamanhos: number; classificacoes: number; precos: number; sabores: number; adicionais: number; erros: number };
  errors: ImportError[];
  rows: Array<{ rowNumber: number; tipo: string; grupo: string; resumo: string }>;
};
const MULTISABOR_HEADERS = ["tipo_registro","grupo","categoria","tamanho","min_sabores","max_sabores","classificacao","rank","preco","produto","grupo_adicional","nome_etapa_quantidade","nome_opcoes","regra_preco","ativo","ordem"];
const normName = (v: unknown) => String(v ?? "").trim().toLowerCase();
const parseMultisaborPrice = (value: string) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
function parseMultisaborCsvRows(csv: string, store: { categories: any[]; products: any[]; addonGroups: any[]; existingGroups: any[]; existingSizes: any[]; existingClasses: any[] }) {
  const errors: ImportError[] = [];
  const parsed = parseCsv(csv || "");
  const headers = parsed[0]?.map(normalizeHeader) ?? [];
  const map: Record<string, number> = {};
  MULTISABOR_HEADERS.forEach((h) => { const idx = headers.indexOf(normalizeHeader(h)); if (idx >= 0) map[h] = idx; });
  for (const required of ["tipo_registro", "grupo"]) if (map[required] === undefined) errors.push({ rowNumber: 1, field: required, message: `Coluna obrigatória ausente: ${required}.` });
  const rows = parsed.slice(1).map((r, i) => ({ raw: r, rowNumber: i + 2, tipo: cell(r, map, "tipo_registro").toLowerCase(), grupo: cell(r, map, "grupo"), categoria: cell(r, map, "categoria"), tamanho: cell(r, map, "tamanho"), min: Number(cell(r, map, "min_sabores") || 1), max: Number(cell(r, map, "max_sabores") || 1), classificacao: cell(r, map, "classificacao"), rank: Number(cell(r, map, "rank") || 0), precoRaw: cell(r, map, "preco"), produto: cell(r, map, "produto"), grupoAdicional: cell(r, map, "grupo_adicional"), quantidade: cell(r, map, "nome_etapa_quantidade") || "Quantidade de sabores", opcoes: cell(r, map, "nome_opcoes") || "Sabores", ativo: parseBooleanValue(cell(r, map, "ativo"), true), ordem: Number(cell(r, map, "ordem") || 0) }));
  const categories = new Map(store.categories.map((x:any) => [normName(x.name), x]));
  const products = new Map(store.products.map((x:any) => [normName(x.name), x]));
  const addons = new Map(store.addonGroups.map((x:any) => [normName(x.name), x]));
  const groupNames = new Set(store.existingGroups.map((x:any) => normName(x.name)));
  rows.filter(r => r.tipo === "grupo").forEach(r => { if (r.grupo) groupNames.add(normName(r.grupo)); });
  const sizes = new Set(store.existingSizes.map((x:any) => `${normName(x.groupName)}|${normName(x.name)}`));
  rows.filter(r => r.tipo === "tamanho" && r.grupo && r.tamanho).forEach(r => sizes.add(`${normName(r.grupo)}|${normName(r.tamanho)}`));
  const classes = new Set(store.existingClasses.map((x:any) => `${normName(x.groupName)}|${normName(x.name)}`));
  rows.filter(r => r.tipo === "classificacao" && r.grupo && r.classificacao).forEach(r => classes.add(`${normName(r.grupo)}|${normName(r.classificacao)}`));
  const counters = { grupos: 0, tamanhos: 0, classificacoes: 0, precos: 0, sabores: 0, adicionais: 0, erros: 0 };
  const previewRows: MultisaborImportPreview["rows"] = [];
  for (const r of rows) {
    if (!r.tipo && !r.grupo) continue;
    if (!r.grupo) errors.push({ rowNumber: r.rowNumber, field: "grupo", message: "grupo obrigatório não informado." });
    else if (!groupNames.has(normName(r.grupo)) && r.tipo !== "grupo") errors.push({ rowNumber: r.rowNumber, field: "grupo", message: `grupo "${r.grupo}" não encontrado.` });
    if (r.categoria && !categories.has(normName(r.categoria))) errors.push({ rowNumber: r.rowNumber, field: "categoria", message: `categoria "${r.categoria}" não encontrada nesta loja.` });
    if (r.tipo === "grupo") { counters.grupos++; previewRows.push({ rowNumber: r.rowNumber, tipo: r.tipo, grupo: r.grupo, resumo: r.categoria ? `Categoria ${r.categoria}` : "Grupo" }); }
    else if (r.tipo === "tamanho") { if (!r.tamanho || !Number.isInteger(r.min) || !Number.isInteger(r.max) || r.min < 1 || r.max < r.min) errors.push({ rowNumber: r.rowNumber, field: "tamanho", message: "tamanho ou limites de sabores inválidos." }); counters.tamanhos++; previewRows.push({ rowNumber: r.rowNumber, tipo: r.tipo, grupo: r.grupo, resumo: r.tamanho }); }
    else if (r.tipo === "classificacao") { if (!r.classificacao) errors.push({ rowNumber: r.rowNumber, field: "classificacao", message: "classificação obrigatória não informada." }); counters.classificacoes++; previewRows.push({ rowNumber: r.rowNumber, tipo: r.tipo, grupo: r.grupo, resumo: r.classificacao }); }
    else if (r.tipo === "preco") { const price = parseMultisaborPrice(r.precoRaw); if (!sizes.has(`${normName(r.grupo)}|${normName(r.tamanho)}`)) errors.push({ rowNumber: r.rowNumber, field: "tamanho", message: `tamanho "${r.tamanho}" não encontrado no grupo "${r.grupo}".` }); if (!classes.has(`${normName(r.grupo)}|${normName(r.classificacao)}`)) errors.push({ rowNumber: r.rowNumber, field: "classificacao", message: `classificação "${r.classificacao}" não encontrada.` }); if (price == null) errors.push({ rowNumber: r.rowNumber, field: "preco", message: `preço inválido "${r.precoRaw}". Use exemplo: 49,90.` }); counters.precos++; previewRows.push({ rowNumber: r.rowNumber, tipo: r.tipo, grupo: r.grupo, resumo: `${r.tamanho} / ${r.classificacao} = ${r.precoRaw}` }); }
    else if (r.tipo === "sabor") { if (!products.has(normName(r.produto))) errors.push({ rowNumber: r.rowNumber, field: "produto", message: `produto "${r.produto}" não encontrado nesta loja.` }); if (!classes.has(`${normName(r.grupo)}|${normName(r.classificacao)}`)) errors.push({ rowNumber: r.rowNumber, field: "classificacao", message: `classificação "${r.classificacao}" não encontrada.` }); counters.sabores++; previewRows.push({ rowNumber: r.rowNumber, tipo: r.tipo, grupo: r.grupo, resumo: r.produto }); }
    else if (r.tipo === "adicional") { if (!addons.has(normName(r.grupoAdicional))) errors.push({ rowNumber: r.rowNumber, field: "grupo_adicional", message: `grupo de adicional "${r.grupoAdicional}" não encontrado nesta loja.` }); counters.adicionais++; previewRows.push({ rowNumber: r.rowNumber, tipo: r.tipo, grupo: r.grupo, resumo: r.grupoAdicional }); }
    else errors.push({ rowNumber: r.rowNumber, field: "tipo_registro", message: `tipo_registro "${r.tipo}" inválido.` });
  }
  counters.erros = errors.length;
  return { counters, errors, rows: previewRows, parsedRows: rows, categories, products, addons };
}
async function buildMultisaborImportPreview(storeId: number, csv: string) {
  const [categories, products, addonGroups, existingGroups, existingSizes, existingClasses] = await Promise.all([
    db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable).where(eq(categoriesTable.storeId, storeId)),
    db.select({ id: productsTable.id, name: productsTable.name }).from(productsTable).where(eq(productsTable.storeId, storeId)),
    db.select({ id: addonGroupsTable.id, name: addonGroupsTable.name }).from(addonGroupsTable).where(eq(addonGroupsTable.storeId, storeId)),
    db.select({ id: multiflavorGroupsTable.id, name: multiflavorGroupsTable.name }).from(multiflavorGroupsTable).where(eq(multiflavorGroupsTable.storeId, storeId)),
    db.select({ id: multiflavorSizesTable.id, name: multiflavorSizesTable.name, groupId: multiflavorSizesTable.groupId, groupName: multiflavorGroupsTable.name }).from(multiflavorSizesTable).innerJoin(multiflavorGroupsTable, eq(multiflavorSizesTable.groupId, multiflavorGroupsTable.id)).where(and(eq(multiflavorSizesTable.storeId, storeId), eq(multiflavorGroupsTable.storeId, storeId))),
    db.select({ id: multiflavorClassificationsTable.id, name: multiflavorClassificationsTable.name, groupId: multiflavorClassificationsTable.groupId, groupName: multiflavorGroupsTable.name }).from(multiflavorClassificationsTable).innerJoin(multiflavorGroupsTable, eq(multiflavorClassificationsTable.groupId, multiflavorGroupsTable.id)).where(and(eq(multiflavorClassificationsTable.storeId, storeId), eq(multiflavorGroupsTable.storeId, storeId))),
  ]);
  return parseMultisaborCsvRows(csv, { categories, products, addonGroups, existingGroups, existingSizes, existingClasses });
}


router.get("/menu/multisabor/import-template", (_req, res) => {
  const sample = [
    MULTISABOR_HEADERS.join(";"),
    "grupo;Pizza Multisabor;Pizzas;;;;;;;;;Quantidade de sabores;Sabores;highest_classification;sim;1",
    "tamanho;Pizza Multisabor;;Broto;1;1;;;;;;;;sim;1",
    "tamanho;Pizza Multisabor;;Grande;1;2;;;;;;;;sim;2",
    "classificacao;Pizza Multisabor;;;;;Tradicional;1;;;;;;sim;1",
    "classificacao;Pizza Multisabor;;;;;Especial;2;;;;;;sim;2",
    "preco;Pizza Multisabor;;Grande;;;Tradicional;;54,90;;;;;;;",
    "preco;Pizza Multisabor;;Grande;;;Especial;;64,90;;;;;;;",
    "sabor;Pizza Multisabor;;;;;Tradicional;;;Pizza Calabresa;;;;sim;1",
    "sabor;Pizza Multisabor;;;;;Especial;;;Pizza Quatro Queijos;;;;sim;2",
    "adicional;Pizza Multisabor;;;;;;;;;;Bordas;;;;1",
  ].join("\n");
  res.header("Content-Type", "text/csv; charset=utf-8");
  res.header("Content-Disposition", 'attachment; filename="modelo-multisabor.csv"');
  res.send(sample);
});

router.post("/menu/multisabor/import/preview", async (req, res) => {
  const actor = await getCurrentActor(req);
  const preview = await buildMultisaborImportPreview(actor.storeId, String(req.body.csv ?? ""));
  res.json({ counters: preview.counters, errors: preview.errors, rows: preview.rows });
});

router.post("/menu/multisabor/import/confirm", async (req, res) => {
  const actor = await getCurrentActor(req);
  const preview = await buildMultisaborImportPreview(actor.storeId, String(req.body.csv ?? ""));
  if (preview.errors.length) { res.status(400).json({ error: "Corrija os erros antes de importar.", errors: preview.errors, counters: preview.counters }); return; }
  const result = await db.transaction(async (tx) => {
    const groupMap = new Map<string, any>();
    for (const g of await tx.select().from(multiflavorGroupsTable).where(eq(multiflavorGroupsTable.storeId, actor.storeId))) groupMap.set(normName(g.name), g);
    const sizeMap = new Map<string, any>();
    const classMap = new Map<string, any>();
    for (const s of preview.parsedRows.length ? await tx.select({ id: multiflavorSizesTable.id, name: multiflavorSizesTable.name, groupId: multiflavorSizesTable.groupId, groupName: multiflavorGroupsTable.name }).from(multiflavorSizesTable).innerJoin(multiflavorGroupsTable, eq(multiflavorSizesTable.groupId, multiflavorGroupsTable.id)).where(and(eq(multiflavorSizesTable.storeId, actor.storeId), eq(multiflavorGroupsTable.storeId, actor.storeId))) : []) sizeMap.set(`${normName(s.groupName)}|${normName(s.name)}`, s);
    for (const c of preview.parsedRows.length ? await tx.select({ id: multiflavorClassificationsTable.id, name: multiflavorClassificationsTable.name, groupId: multiflavorClassificationsTable.groupId, groupName: multiflavorGroupsTable.name }).from(multiflavorClassificationsTable).innerJoin(multiflavorGroupsTable, eq(multiflavorClassificationsTable.groupId, multiflavorGroupsTable.id)).where(and(eq(multiflavorClassificationsTable.storeId, actor.storeId), eq(multiflavorGroupsTable.storeId, actor.storeId))) : []) classMap.set(`${normName(c.groupName)}|${normName(c.name)}`, c);
    for (const r of preview.parsedRows.filter(r => r.tipo === "grupo")) {
      const existing = groupMap.get(normName(r.grupo));
      const category = r.categoria ? preview.categories.get(normName(r.categoria)) : null;
      const values = { categoryId: category?.id ?? null, description: null, quantityStepLabel: r.quantidade, optionsStepLabel: r.opcoes, pricingMode: "highest_classification", active: r.ativo, available: r.ativo, sortOrder: r.ordem, updatedAt: new Date() };
      const [row] = existing ? await tx.update(multiflavorGroupsTable).set(values).where(and(eq(multiflavorGroupsTable.storeId, actor.storeId), eq(multiflavorGroupsTable.id, existing.id))).returning() : await tx.insert(multiflavorGroupsTable).values({ storeId: actor.storeId, name: r.grupo, ...values }).returning();
      groupMap.set(normName(row.name), row);
    }
    for (const r of preview.parsedRows.filter(r => r.tipo === "tamanho")) {
      const g = groupMap.get(normName(r.grupo));
      const key = `${normName(r.grupo)}|${normName(r.tamanho)}`;
      const old = sizeMap.get(key);
      const [row] = old ? await tx.update(multiflavorSizesTable).set({ minFlavors: r.min, maxFlavors: r.max, active: r.ativo, available: r.ativo, sortOrder: r.ordem, updatedAt: new Date() }).where(and(eq(multiflavorSizesTable.storeId, actor.storeId), eq(multiflavorSizesTable.id, old.id))).returning() : await tx.insert(multiflavorSizesTable).values({ storeId: actor.storeId, groupId: g.id, name: r.tamanho, minFlavors: r.min, maxFlavors: r.max, active: r.ativo, available: r.ativo, sortOrder: r.ordem }).returning();
      sizeMap.set(key, row);
    }
    for (const r of preview.parsedRows.filter(r => r.tipo === "classificacao")) {
      const g = groupMap.get(normName(r.grupo));
      const key = `${normName(r.grupo)}|${normName(r.classificacao)}`;
      const old = classMap.get(key);
      const [row] = old ? await tx.update(multiflavorClassificationsTable).set({ rank: r.rank, active: r.ativo, sortOrder: r.ordem, updatedAt: new Date() }).where(and(eq(multiflavorClassificationsTable.storeId, actor.storeId), eq(multiflavorClassificationsTable.id, old.id))).returning() : await tx.insert(multiflavorClassificationsTable).values({ storeId: actor.storeId, groupId: g.id, name: r.classificacao, rank: r.rank, active: r.ativo, sortOrder: r.ordem }).returning();
      classMap.set(key, row);
    }
    for (const r of preview.parsedRows.filter(r => r.tipo === "preco")) {
      const g = groupMap.get(normName(r.grupo)), size = sizeMap.get(`${normName(r.grupo)}|${normName(r.tamanho)}`), cls = classMap.get(`${normName(r.grupo)}|${normName(r.classificacao)}`), price = parseMultisaborPrice(r.precoRaw)!;
      await tx.insert(multiflavorSizeClassificationPricesTable).values({ storeId: actor.storeId, groupId: g.id, sizeId: size.id, classificationId: cls.id, price: String(price) }).onConflictDoUpdate({ target: [multiflavorSizeClassificationPricesTable.storeId, multiflavorSizeClassificationPricesTable.sizeId, multiflavorSizeClassificationPricesTable.classificationId], set: { groupId: g.id, price: String(price), updatedAt: new Date() } });
    }
    for (const r of preview.parsedRows.filter(r => r.tipo === "sabor")) {
      const g = groupMap.get(normName(r.grupo)), cls = classMap.get(`${normName(r.grupo)}|${normName(r.classificacao)}`), product = preview.products.get(normName(r.produto));
      await tx.insert(multiflavorFlavorsTable).values({ storeId: actor.storeId, groupId: g.id, productId: product.id, classificationId: cls.id, active: r.ativo, available: r.ativo, sortOrder: r.ordem }).onConflictDoUpdate({ target: [multiflavorFlavorsTable.storeId, multiflavorFlavorsTable.groupId, multiflavorFlavorsTable.productId], set: { classificationId: cls.id, active: r.ativo, available: r.ativo, sortOrder: r.ordem, updatedAt: new Date() } });
    }
    for (const r of preview.parsedRows.filter(r => r.tipo === "adicional")) {
      const g = groupMap.get(normName(r.grupo)), addon = preview.addons.get(normName(r.grupoAdicional));
      await tx.insert(multiflavorGroupAddonGroupsTable).values({ storeId: actor.storeId, groupId: g.id, addonGroupId: addon.id, sortOrder: r.ordem }).onConflictDoUpdate({ target: [multiflavorGroupAddonGroupsTable.storeId, multiflavorGroupAddonGroupsTable.groupId, multiflavorGroupAddonGroupsTable.addonGroupId], set: { sortOrder: r.ordem } });
    }
    return preview.counters;
  });
  res.json({ counters: result });
});


router.get("/menu/multisabor/sales-config", async (req, res) => {
  const actor = await getCurrentActor(req);
  const groups = await db
    .select({
      id: multiflavorGroupsTable.id,
      name: multiflavorGroupsTable.name,
      description: multiflavorGroupsTable.description,
      quantityStepLabel: multiflavorGroupsTable.quantityStepLabel,
      optionsStepLabel: multiflavorGroupsTable.optionsStepLabel,
      pricingMode: multiflavorGroupsTable.pricingMode,
      categoryId: multiflavorGroupsTable.categoryId,
      sortOrder: multiflavorGroupsTable.sortOrder,
    })
    .from(multiflavorGroupsTable)
    .where(
      and(
        eq(multiflavorGroupsTable.storeId, actor.storeId),
        eq(multiflavorGroupsTable.active, true),
        eq(multiflavorGroupsTable.available, true),
      ),
    )
    .orderBy(
      asc(multiflavorGroupsTable.sortOrder),
      asc(multiflavorGroupsTable.name),
    );
  res.json(groups);
});

router.get("/menu/multisabor/groups/:groupId/sales-config", async (req, res) => {
  const actor = await getCurrentActor(req);
  const groupId = positiveId(req.params.groupId);
  const [group] = groupId
    ? await db
        .select({
          id: multiflavorGroupsTable.id,
          name: multiflavorGroupsTable.name,
          description: multiflavorGroupsTable.description,
          quantityStepLabel: multiflavorGroupsTable.quantityStepLabel,
          optionsStepLabel: multiflavorGroupsTable.optionsStepLabel,
          pricingMode: multiflavorGroupsTable.pricingMode,
          categoryId: multiflavorGroupsTable.categoryId,
          sortOrder: multiflavorGroupsTable.sortOrder,
        })
        .from(multiflavorGroupsTable)
        .where(
          and(
            eq(multiflavorGroupsTable.storeId, actor.storeId),
            eq(multiflavorGroupsTable.id, groupId),
            eq(multiflavorGroupsTable.active, true),
            eq(multiflavorGroupsTable.available, true),
          ),
        )
        .limit(1)
    : [];
  if (!group) {
    res.status(404).json({ error: "Grupo Multisabor não encontrado." });
    return;
  }

  const [sizes, classifications, prices, flavors, addonRows] = await Promise.all([
    db.select().from(multiflavorSizesTable).where(and(eq(multiflavorSizesTable.storeId, actor.storeId), eq(multiflavorSizesTable.groupId, group.id), eq(multiflavorSizesTable.active, true), eq(multiflavorSizesTable.available, true))).orderBy(asc(multiflavorSizesTable.sortOrder), asc(multiflavorSizesTable.name)),
    db.select().from(multiflavorClassificationsTable).where(and(eq(multiflavorClassificationsTable.storeId, actor.storeId), eq(multiflavorClassificationsTable.groupId, group.id), eq(multiflavorClassificationsTable.active, true))).orderBy(asc(multiflavorClassificationsTable.sortOrder), asc(multiflavorClassificationsTable.rank), asc(multiflavorClassificationsTable.name)),
    db.select().from(multiflavorSizeClassificationPricesTable).where(and(eq(multiflavorSizeClassificationPricesTable.storeId, actor.storeId), eq(multiflavorSizeClassificationPricesTable.groupId, group.id))),
    db.select({ id: multiflavorFlavorsTable.id, productId: multiflavorFlavorsTable.productId, productName: productsTable.name, classificationId: multiflavorFlavorsTable.classificationId, active: multiflavorFlavorsTable.active, available: multiflavorFlavorsTable.available, sortOrder: multiflavorFlavorsTable.sortOrder }).from(multiflavorFlavorsTable).innerJoin(productsTable, eq(multiflavorFlavorsTable.productId, productsTable.id)).where(and(eq(multiflavorFlavorsTable.storeId, actor.storeId), eq(multiflavorFlavorsTable.groupId, group.id), eq(multiflavorFlavorsTable.active, true), eq(multiflavorFlavorsTable.available, true), eq(productsTable.storeId, actor.storeId), eq(productsTable.active, true), eq(productsTable.available, true))).orderBy(asc(multiflavorFlavorsTable.sortOrder), asc(productsTable.name)),
    db.select({ linkId: multiflavorGroupAddonGroupsTable.id, addonGroupId: addonGroupsTable.id, addonGroupName: addonGroupsTable.name, required: addonGroupsTable.required, minSelected: addonGroupsTable.minSelected, maxSelected: addonGroupsTable.maxSelected, addonGroupSortOrder: addonGroupsTable.sortOrder, optionId: addonOptionsTable.id, optionName: addonOptionsTable.name, optionPrice: addonOptionsTable.price, optionAvailable: addonOptionsTable.available, optionSortOrder: addonOptionsTable.sortOrder }).from(multiflavorGroupAddonGroupsTable).innerJoin(addonGroupsTable, eq(multiflavorGroupAddonGroupsTable.addonGroupId, addonGroupsTable.id)).leftJoin(addonOptionsTable, and(eq(addonOptionsTable.groupId, addonGroupsTable.id), eq(addonOptionsTable.storeId, actor.storeId), eq(addonOptionsTable.available, true))).where(and(eq(multiflavorGroupAddonGroupsTable.storeId, actor.storeId), eq(multiflavorGroupAddonGroupsTable.groupId, group.id), eq(addonGroupsTable.storeId, actor.storeId), eq(addonGroupsTable.active, true))).orderBy(asc(multiflavorGroupAddonGroupsTable.sortOrder), asc(addonGroupsTable.sortOrder), asc(addonGroupsTable.name), asc(addonOptionsTable.sortOrder), asc(addonOptionsTable.name)),
  ]);

  const addonGroups = Array.from(addonRows.reduce((map, row) => {
    const current = map.get(row.addonGroupId) ?? { id: row.linkId, addonGroupId: row.addonGroupId, addonGroupName: row.addonGroupName, required: row.required, minSelected: row.minSelected, maxSelected: row.maxSelected, sortOrder: row.addonGroupSortOrder, options: [] as Array<{ id: number; name: string; price: number; available: boolean; sortOrder: number }> };
    if (row.optionId) current.options.push({ id: row.optionId, name: row.optionName!, price: Number(row.optionPrice), available: row.optionAvailable!, sortOrder: row.optionSortOrder! });
    map.set(row.addonGroupId, current);
    return map;
  }, new Map<number, any>()).values());

  res.json({ group, sizes, classifications, prices, flavors, addonGroups });
});

router.post("/menu/multisabor/quote", async (req, res) => {
  const actor = await getCurrentActor(req);
  const fail = (message: string): void => { res.status(400).json({ error: message }); };
  const groupId = positiveId(req.body?.groupId);
  const sizeId = positiveId(req.body?.sizeId);
  const quantity = req.body?.quantity == null ? 1 : Number(req.body.quantity);
  if (!groupId) { fail("Grupo Multisabor não encontrado."); return; }
  if (!sizeId) { fail("Tamanho não encontrado para este grupo."); return; }
  if (!Number.isInteger(quantity) || quantity < 1) { fail("Quantidade inválida."); return; }
  const flavorProductIds: number[] = Array.isArray(req.body?.flavorProductIds) ? req.body.flavorProductIds.map(Number) : [];
  const addonsInput = Array.isArray(req.body?.addons) ? req.body.addons : [];

  const [[group], [size]] = await Promise.all([
    db.select({ id: multiflavorGroupsTable.id, name: multiflavorGroupsTable.name }).from(multiflavorGroupsTable).where(and(eq(multiflavorGroupsTable.storeId, actor.storeId), eq(multiflavorGroupsTable.id, groupId), eq(multiflavorGroupsTable.active, true), eq(multiflavorGroupsTable.available, true))).limit(1),
    db.select({ id: multiflavorSizesTable.id, name: multiflavorSizesTable.name, minFlavors: multiflavorSizesTable.minFlavors, maxFlavors: multiflavorSizesTable.maxFlavors }).from(multiflavorSizesTable).where(and(eq(multiflavorSizesTable.storeId, actor.storeId), eq(multiflavorSizesTable.groupId, groupId), eq(multiflavorSizesTable.id, sizeId), eq(multiflavorSizesTable.active, true), eq(multiflavorSizesTable.available, true))).limit(1),
  ]);
  if (!group) { fail("Grupo Multisabor não encontrado."); return; }
  if (!size) { fail("Tamanho não encontrado para este grupo."); return; }
  if (flavorProductIds.length < size.minFlavors || flavorProductIds.length > size.maxFlavors) { fail(`Este tamanho permite no mínimo ${size.minFlavors} e no máximo ${size.maxFlavors} sabores.`); return; }

  const flavorRows = flavorProductIds.length ? await db.select({ productId: multiflavorFlavorsTable.productId, productName: productsTable.name, classificationId: multiflavorFlavorsTable.classificationId, classificationName: multiflavorClassificationsTable.name, rank: multiflavorClassificationsTable.rank }).from(multiflavorFlavorsTable).innerJoin(productsTable, eq(multiflavorFlavorsTable.productId, productsTable.id)).innerJoin(multiflavorClassificationsTable, eq(multiflavorFlavorsTable.classificationId, multiflavorClassificationsTable.id)).where(and(eq(multiflavorFlavorsTable.storeId, actor.storeId), eq(multiflavorFlavorsTable.groupId, groupId), inArray(multiflavorFlavorsTable.productId, flavorProductIds), eq(multiflavorFlavorsTable.active, true), eq(multiflavorFlavorsTable.available, true), eq(productsTable.storeId, actor.storeId), eq(multiflavorClassificationsTable.storeId, actor.storeId), eq(multiflavorClassificationsTable.groupId, groupId), eq(multiflavorClassificationsTable.active, true))) : [];
  const flavorsByProductId = new Map(flavorRows.map((flavor) => [flavor.productId, flavor]));
  for (const productId of flavorProductIds) {
    if (!Number.isSafeInteger(productId) || productId <= 0 || !flavorsByProductId.has(productId)) { fail(`O sabor "ID ${productId}" não pertence a este grupo.`); return; }
  }
  const flavors: Array<(typeof flavorRows)[number]> = flavorProductIds.map((productId: number) => flavorsByProductId.get(productId)!);
  const winning = flavors.reduce((best: (typeof flavors)[number] | null, flavor: (typeof flavors)[number]) => !best || flavor.rank > best.rank ? flavor : best, null);
  if (!winning) { fail("Classificação do sabor não encontrada."); return; }
  const [priceRow] = await db.select({ price: multiflavorSizeClassificationPricesTable.price }).from(multiflavorSizeClassificationPricesTable).where(and(eq(multiflavorSizeClassificationPricesTable.storeId, actor.storeId), eq(multiflavorSizeClassificationPricesTable.groupId, groupId), eq(multiflavorSizeClassificationPricesTable.sizeId, sizeId), eq(multiflavorSizeClassificationPricesTable.classificationId, winning.classificationId))).limit(1);
  if (!priceRow) { fail("Preço não encontrado para o tamanho e classificação selecionados."); return; }

  const addonIds = addonsInput.map((addon: any) => Number(addon?.addonOptionId)).filter((id: number) => Number.isSafeInteger(id) && id > 0);
  const linkedAddonGroups = await db.select({ addonGroupId: addonGroupsTable.id, required: addonGroupsTable.required, minSelected: addonGroupsTable.minSelected, maxSelected: addonGroupsTable.maxSelected }).from(multiflavorGroupAddonGroupsTable).innerJoin(addonGroupsTable, eq(multiflavorGroupAddonGroupsTable.addonGroupId, addonGroupsTable.id)).where(and(eq(multiflavorGroupAddonGroupsTable.storeId, actor.storeId), eq(multiflavorGroupAddonGroupsTable.groupId, groupId), eq(addonGroupsTable.storeId, actor.storeId), eq(addonGroupsTable.active, true)));
  const addonRows = addonIds.length ? await db.select({ addonOptionId: addonOptionsTable.id, addonName: addonOptionsTable.name, addonGroupId: addonGroupsTable.id, addonGroupName: addonGroupsTable.name, required: addonGroupsTable.required, minSelected: addonGroupsTable.minSelected, maxSelected: addonGroupsTable.maxSelected, unitPrice: addonOptionsTable.price }).from(addonOptionsTable).innerJoin(addonGroupsTable, eq(addonOptionsTable.groupId, addonGroupsTable.id)).innerJoin(multiflavorGroupAddonGroupsTable, eq(multiflavorGroupAddonGroupsTable.addonGroupId, addonGroupsTable.id)).where(and(eq(addonOptionsTable.storeId, actor.storeId), eq(addonOptionsTable.available, true), eq(addonGroupsTable.storeId, actor.storeId), eq(addonGroupsTable.active, true), eq(multiflavorGroupAddonGroupsTable.storeId, actor.storeId), eq(multiflavorGroupAddonGroupsTable.groupId, groupId), inArray(addonOptionsTable.id, addonIds))) : [];
  const addonById = new Map(addonRows.map((addon) => [addon.addonOptionId, addon]));
  const addonCountsByGroup = new Map<number, number>();
  const addons: Array<{ addonOptionId: number; addonName: string; addonGroupName: string; quantity: number; unitPrice: number; totalPrice: number }> = [];
  for (const addon of addonsInput) {
    const addonOptionId = Number(addon?.addonOptionId);
    const addonQuantity = addon?.quantity == null ? 1 : Number(addon.quantity);
    if (!Number.isInteger(addonQuantity) || addonQuantity < 1) { fail("Quantidade inválida."); return; }
    const row = addonById.get(addonOptionId);
    if (!row) { fail("Adicional não pertence a este Multisabor."); return; }
    addonCountsByGroup.set(row.addonGroupId, (addonCountsByGroup.get(row.addonGroupId) ?? 0) + addonQuantity);
    addons.push({ addonOptionId, addonName: row.addonName, addonGroupName: row.addonGroupName, quantity: addonQuantity, unitPrice: Number(row.unitPrice), totalPrice: Number(row.unitPrice) * addonQuantity });
  }
  for (const row of linkedAddonGroups) {
    const count = addonCountsByGroup.get(row.addonGroupId) ?? 0;
    if (row.required && count < Math.max(1, row.minSelected)) { fail("Quantidade inválida."); return; }
    if (count < row.minSelected || (row.maxSelected != null && count > row.maxSelected)) { fail("Quantidade inválida."); return; }
  }

  const basePrice = Number(priceRow.price);
  const addonsTotal = addons.reduce((sum, addon) => sum + addon.totalPrice, 0);
  const unitPrice = basePrice + addonsTotal;
  const totalPrice = unitPrice * quantity;
  const flavorNames = flavors.map((flavor) => flavor.productName);
  res.json({ valid: true, group, size, pricingClassification: { id: winning.classificationId, name: winning.classificationName, rank: winning.rank }, flavors: flavors.map((flavor) => ({ productId: flavor.productId, productName: flavor.productName, classificationName: flavor.classificationName, rank: flavor.rank })), addons, basePrice, addonsTotal, unitPrice, quantity, totalPrice, displayName: `${group.name} ${size.name} - ${flavors.length} ${flavors.length === 1 ? "sabor" : "sabores"}`, summary: `${size.name} com ${flavorNames.join(" e ")}` });
});

router.get("/menu/multisabor/groups", async (req, res) => {
  const actor = await getCurrentActor(req);
  const rows = await db
    .select()
    .from(multiflavorGroupsTable)
    .where(eq(multiflavorGroupsTable.storeId, actor.storeId))
    .orderBy(
      asc(multiflavorGroupsTable.sortOrder),
      asc(multiflavorGroupsTable.name),
    );
  res.json(rows);
});

router.post("/menu/multisabor/groups", async (req, res) => {
  const actor = await getCurrentActor(req);
  if (!req.body.name) {
    res.status(400).json({ error: "Informe o nome do grupo Multisabor." });
    return;
  }
  const categoryId =
    req.body.categoryId == null ? null : positiveId(req.body.categoryId);
  if (req.body.categoryId != null) {
    const [category] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.storeId, actor.storeId),
          eq(categoriesTable.id, categoryId ?? 0),
        ),
      )
      .limit(1);
    if (!category) {
      res.status(400).json({ error: "Categoria não pertence à loja atual." });
      return;
    }
  }
  const [row] = await db
    .insert(multiflavorGroupsTable)
    .values({
      storeId: actor.storeId,
      categoryId,
      name: String(req.body.name),
      description:
        req.body.description == null ? null : String(req.body.description),
      quantityStepLabel: req.body.quantityStepLabel
        ? String(req.body.quantityStepLabel)
        : "Quantidade de sabores",
      optionsStepLabel: req.body.optionsStepLabel
        ? String(req.body.optionsStepLabel)
        : "Sabores",
      pricingMode: "highest_classification",
      active: req.body.active ?? true,
      available: req.body.available ?? true,
      sortOrder: Number(req.body.sortOrder ?? 0),
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/menu/multisabor/groups/:groupId", async (req, res) => {
  const actor = await getCurrentActor(req);
  const groupId = positiveId(req.params.groupId);
  if (!groupId || !(await ensureMultiflavorGroup(actor.storeId, groupId))) {
    res.status(404).json({ error: "Grupo Multisabor não encontrado." });
    return;
  }
  const patch: any = { updatedAt: new Date() };
  if (req.body.name !== undefined) patch.name = String(req.body.name);
  if (req.body.description !== undefined)
    patch.description =
      req.body.description == null ? null : String(req.body.description);
  if (req.body.quantityStepLabel !== undefined)
    patch.quantityStepLabel = String(req.body.quantityStepLabel);
  if (req.body.optionsStepLabel !== undefined)
    patch.optionsStepLabel = String(req.body.optionsStepLabel);
  if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
  if (req.body.available !== undefined)
    patch.available = Boolean(req.body.available);
  if (req.body.sortOrder !== undefined)
    patch.sortOrder = Number(req.body.sortOrder);
  const [row] = await db
    .update(multiflavorGroupsTable)
    .set(patch)
    .where(
      and(
        eq(multiflavorGroupsTable.storeId, actor.storeId),
        eq(multiflavorGroupsTable.id, groupId),
      ),
    )
    .returning();
  res.json(row);
});

router.delete("/menu/multisabor/groups/:groupId", async (req, res) => {
  const actor = await getCurrentActor(req);
  const groupId = positiveId(req.params.groupId);
  const [row] = await db
    .update(multiflavorGroupsTable)
    .set({ active: false, available: false, updatedAt: new Date() })
    .where(
      and(
        eq(multiflavorGroupsTable.storeId, actor.storeId),
        eq(multiflavorGroupsTable.id, groupId ?? 0),
      ),
    )
    .returning({ id: multiflavorGroupsTable.id });
  if (!row) {
    res.status(404).json({ error: "Grupo Multisabor não encontrado." });
    return;
  }
  res.status(204).end();
});

router.get("/menu/multisabor/groups/:groupId/config", async (req, res) => {
  const actor = await getCurrentActor(req);
  const groupId = positiveId(req.params.groupId);
  if (!groupId || !(await ensureMultiflavorGroup(actor.storeId, groupId))) {
    res.status(404).json({ error: "Grupo Multisabor não encontrado." });
    return;
  }
  const [sizes, classifications, prices, flavors, addonGroups] =
    await Promise.all([
      db
        .select()
        .from(multiflavorSizesTable)
        .where(
          and(
            eq(multiflavorSizesTable.storeId, actor.storeId),
            eq(multiflavorSizesTable.groupId, groupId),
          ),
        )
        .orderBy(
          asc(multiflavorSizesTable.sortOrder),
          asc(multiflavorSizesTable.name),
        ),
      db
        .select()
        .from(multiflavorClassificationsTable)
        .where(
          and(
            eq(multiflavorClassificationsTable.storeId, actor.storeId),
            eq(multiflavorClassificationsTable.groupId, groupId),
          ),
        )
        .orderBy(
          asc(multiflavorClassificationsTable.sortOrder),
          asc(multiflavorClassificationsTable.name),
        ),
      db
        .select()
        .from(multiflavorSizeClassificationPricesTable)
        .where(
          and(
            eq(multiflavorSizeClassificationPricesTable.storeId, actor.storeId),
            eq(multiflavorSizeClassificationPricesTable.groupId, groupId),
          ),
        ),
      db
        .select({
          id: multiflavorFlavorsTable.id,
          storeId: multiflavorFlavorsTable.storeId,
          groupId: multiflavorFlavorsTable.groupId,
          productId: multiflavorFlavorsTable.productId,
          productName: productsTable.name,
          classificationId: multiflavorFlavorsTable.classificationId,
          active: multiflavorFlavorsTable.active,
          available: multiflavorFlavorsTable.available,
          sortOrder: multiflavorFlavorsTable.sortOrder,
        })
        .from(multiflavorFlavorsTable)
        .innerJoin(
          productsTable,
          eq(multiflavorFlavorsTable.productId, productsTable.id),
        )
        .where(
          and(
            eq(multiflavorFlavorsTable.storeId, actor.storeId),
            eq(multiflavorFlavorsTable.groupId, groupId),
            eq(productsTable.storeId, actor.storeId),
          ),
        )
        .orderBy(
          asc(multiflavorFlavorsTable.sortOrder),
          asc(productsTable.name),
        ),
      db
        .select({
          id: multiflavorGroupAddonGroupsTable.id,
          storeId: multiflavorGroupAddonGroupsTable.storeId,
          groupId: multiflavorGroupAddonGroupsTable.groupId,
          addonGroupId: multiflavorGroupAddonGroupsTable.addonGroupId,
          addonGroupName: addonGroupsTable.name,
          sortOrder: multiflavorGroupAddonGroupsTable.sortOrder,
        })
        .from(multiflavorGroupAddonGroupsTable)
        .innerJoin(
          addonGroupsTable,
          eq(
            multiflavorGroupAddonGroupsTable.addonGroupId,
            addonGroupsTable.id,
          ),
        )
        .where(
          and(
            eq(multiflavorGroupAddonGroupsTable.storeId, actor.storeId),
            eq(multiflavorGroupAddonGroupsTable.groupId, groupId),
            eq(addonGroupsTable.storeId, actor.storeId),
          ),
        )
        .orderBy(
          asc(multiflavorGroupAddonGroupsTable.sortOrder),
          asc(addonGroupsTable.name),
        ),
    ]);
  res.json({ sizes, classifications, prices, flavors, addonGroups });
});

router.post("/menu/multisabor/groups/:groupId/sizes", async (req, res) => {
  const actor = await getCurrentActor(req);
  const groupId = positiveId(req.params.groupId);
  const minFlavors = Number(req.body.minFlavors ?? 1),
    maxFlavors = Number(req.body.maxFlavors);
  if (
    !groupId ||
    !(await ensureMultiflavorGroup(actor.storeId, groupId)) ||
    !req.body.name ||
    !Number.isInteger(minFlavors) ||
    !Number.isInteger(maxFlavors) ||
    minFlavors < 1 ||
    maxFlavors < minFlavors
  ) {
    res
      .status(400)
      .json({
        error: "Grupo, nome ou limites de sabores inválidos para esta loja.",
      });
    return;
  }
  const [row] = await db
    .insert(multiflavorSizesTable)
    .values({
      storeId: actor.storeId,
      groupId,
      name: String(req.body.name),
      minFlavors,
      maxFlavors,
      active: req.body.active ?? true,
      available: req.body.available ?? true,
      sortOrder: Number(req.body.sortOrder ?? 0),
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/menu/multisabor/sizes/:sizeId", async (req, res) => {
  const actor = await getCurrentActor(req);
  const sizeId = positiveId(req.params.sizeId);
  const [old] = await db
    .select()
    .from(multiflavorSizesTable)
    .where(
      and(
        eq(multiflavorSizesTable.storeId, actor.storeId),
        eq(multiflavorSizesTable.id, sizeId ?? 0),
      ),
    )
    .limit(1);
  if (!old) {
    res.status(404).json({ error: "Tamanho não encontrado." });
    return;
  }
  const minFlavors =
      req.body.minFlavors !== undefined
        ? Number(req.body.minFlavors)
        : old.minFlavors,
    maxFlavors =
      req.body.maxFlavors !== undefined
        ? Number(req.body.maxFlavors)
        : old.maxFlavors;
  if (
    !Number.isInteger(minFlavors) ||
    !Number.isInteger(maxFlavors) ||
    minFlavors < 1 ||
    maxFlavors < minFlavors
  ) {
    res.status(400).json({ error: "Limites de sabores inválidos." });
    return;
  }
  const patch: any = { updatedAt: new Date(), minFlavors, maxFlavors };
  if (req.body.name !== undefined) patch.name = String(req.body.name);
  if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
  if (req.body.available !== undefined)
    patch.available = Boolean(req.body.available);
  if (req.body.sortOrder !== undefined)
    patch.sortOrder = Number(req.body.sortOrder);
  const [row] = await db
    .update(multiflavorSizesTable)
    .set(patch)
    .where(
      and(
        eq(multiflavorSizesTable.storeId, actor.storeId),
        eq(multiflavorSizesTable.id, old.id),
      ),
    )
    .returning();
  res.json(row);
});

router.post(
  "/menu/multisabor/groups/:groupId/classifications",
  async (req, res) => {
    const actor = await getCurrentActor(req);
    const groupId = positiveId(req.params.groupId);
    if (
      !groupId ||
      !(await ensureMultiflavorGroup(actor.storeId, groupId)) ||
      !req.body.name
    ) {
      res
        .status(400)
        .json({ error: "Grupo ou classificação inválida para esta loja." });
      return;
    }
    const [row] = await db
      .insert(multiflavorClassificationsTable)
      .values({
        storeId: actor.storeId,
        groupId,
        name: String(req.body.name),
        rank: Number(req.body.rank ?? 0),
        active: req.body.active ?? true,
        sortOrder: Number(req.body.sortOrder ?? 0),
      })
      .returning();
    res.status(201).json(row);
  },
);

router.patch(
  "/menu/multisabor/classifications/:classificationId",
  async (req, res) => {
    const actor = await getCurrentActor(req);
    const id = positiveId(req.params.classificationId);
    const [old] = await db
      .select()
      .from(multiflavorClassificationsTable)
      .where(
        and(
          eq(multiflavorClassificationsTable.storeId, actor.storeId),
          eq(multiflavorClassificationsTable.id, id ?? 0),
        ),
      )
      .limit(1);
    if (!old) {
      res.status(404).json({ error: "Classificação não encontrada." });
      return;
    }
    const patch: any = { updatedAt: new Date() };
    if (req.body.name !== undefined) patch.name = String(req.body.name);
    if (req.body.rank !== undefined) patch.rank = Number(req.body.rank);
    if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
    if (req.body.sortOrder !== undefined)
      patch.sortOrder = Number(req.body.sortOrder);
    const [row] = await db
      .update(multiflavorClassificationsTable)
      .set(patch)
      .where(
        and(
          eq(multiflavorClassificationsTable.storeId, actor.storeId),
          eq(multiflavorClassificationsTable.id, old.id),
        ),
      )
      .returning();
    res.json(row);
  },
);

router.put("/menu/multisabor/groups/:groupId/prices", async (req, res) => {
  const actor = await getCurrentActor(req);
  const groupId = positiveId(req.params.groupId);
  const entries = Array.isArray(req.body.prices) ? req.body.prices : [];
  if (!groupId || !(await ensureMultiflavorGroup(actor.storeId, groupId))) {
    res.status(404).json({ error: "Grupo Multisabor não encontrado." });
    return;
  }
  const saved = [];
  for (const entry of entries) {
    const sizeId = positiveId(entry.sizeId),
      classificationId = positiveId(entry.classificationId),
      price = pizzaNumber(entry.price);
    if (
      !sizeId ||
      !classificationId ||
      price == null ||
      price < 0 ||
      !(await ensureMultiflavorSize(actor.storeId, groupId, sizeId)) ||
      !(await ensureMultiflavorClassification(
        actor.storeId,
        groupId,
        classificationId,
      ))
    ) {
      res
        .status(400)
        .json({
          error:
            "Preço, tamanho ou classificação inválida para este grupo e loja.",
        });
      return;
    }
    const [row] = await db
      .insert(multiflavorSizeClassificationPricesTable)
      .values({
        storeId: actor.storeId,
        groupId,
        sizeId,
        classificationId,
        price: String(price),
      })
      .onConflictDoUpdate({
        target: [
          multiflavorSizeClassificationPricesTable.storeId,
          multiflavorSizeClassificationPricesTable.sizeId,
          multiflavorSizeClassificationPricesTable.classificationId,
        ],
        set: { groupId, price: String(price), updatedAt: new Date() },
      })
      .returning();
    saved.push(row);
  }
  res.json(saved);
});

router.post("/menu/multisabor/groups/:groupId/flavors", async (req, res) => {
  const actor = await getCurrentActor(req);
  const groupId = positiveId(req.params.groupId),
    productId = positiveId(req.body.productId),
    classificationId = positiveId(req.body.classificationId);
  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.storeId, actor.storeId),
        eq(productsTable.id, productId ?? 0),
      ),
    )
    .limit(1);
  if (
    !groupId ||
    !product ||
    !(await ensureMultiflavorGroup(actor.storeId, groupId)) ||
    !classificationId ||
    !(await ensureMultiflavorClassification(
      actor.storeId,
      groupId,
      classificationId,
    ))
  ) {
    res
      .status(400)
      .json({
        error: "Grupo, produto ou classificação não pertence à loja atual.",
      });
    return;
  }
  const [row] = await db
    .insert(multiflavorFlavorsTable)
    .values({
      storeId: actor.storeId,
      groupId,
      productId: product.id,
      classificationId,
      active: req.body.active ?? true,
      available: req.body.available ?? true,
      sortOrder: Number(req.body.sortOrder ?? 0),
    })
    .onConflictDoUpdate({
      target: [
        multiflavorFlavorsTable.storeId,
        multiflavorFlavorsTable.groupId,
        multiflavorFlavorsTable.productId,
      ],
      set: {
        classificationId,
        active: req.body.active ?? true,
        available: req.body.available ?? true,
        sortOrder: Number(req.body.sortOrder ?? 0),
        updatedAt: new Date(),
      },
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/menu/multisabor/flavors/:flavorId", async (req, res) => {
  const actor = await getCurrentActor(req);
  const id = positiveId(req.params.flavorId);
  const [old] = await db
    .select()
    .from(multiflavorFlavorsTable)
    .where(
      and(
        eq(multiflavorFlavorsTable.storeId, actor.storeId),
        eq(multiflavorFlavorsTable.id, id ?? 0),
      ),
    )
    .limit(1);
  if (!old) {
    res.status(404).json({ error: "Sabor não encontrado." });
    return;
  }
  const productId =
      req.body.productId !== undefined
        ? positiveId(req.body.productId)
        : old.productId,
    classificationId =
      req.body.classificationId !== undefined
        ? positiveId(req.body.classificationId)
        : old.classificationId;
  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.storeId, actor.storeId),
        eq(productsTable.id, productId ?? 0),
      ),
    )
    .limit(1);
  if (
    !product ||
    !classificationId ||
    !(await ensureMultiflavorClassification(
      actor.storeId,
      old.groupId,
      classificationId,
    ))
  ) {
    res
      .status(400)
      .json({
        error: "Produto ou classificação não pertence ao grupo e loja atuais.",
      });
    return;
  }
  const [row] = await db
    .update(multiflavorFlavorsTable)
    .set({
      productId: product.id,
      classificationId,
      active: req.body.active ?? old.active,
      available: req.body.available ?? old.available,
      sortOrder:
        req.body.sortOrder !== undefined
          ? Number(req.body.sortOrder)
          : old.sortOrder,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(multiflavorFlavorsTable.storeId, actor.storeId),
        eq(multiflavorFlavorsTable.id, old.id),
      ),
    )
    .returning();
  res.json(row);
});

router.post(
  "/menu/multisabor/groups/:groupId/addon-groups",
  async (req, res) => {
    const actor = await getCurrentActor(req);
    const groupId = positiveId(req.params.groupId),
      addonGroupId = positiveId(req.body.addonGroupId);
    const [addonGroup] = await db
      .select({ id: addonGroupsTable.id })
      .from(addonGroupsTable)
      .where(
        and(
          eq(addonGroupsTable.storeId, actor.storeId),
          eq(addonGroupsTable.id, addonGroupId ?? 0),
        ),
      )
      .limit(1);
    if (
      !groupId ||
      !(await ensureMultiflavorGroup(actor.storeId, groupId)) ||
      !addonGroup
    ) {
      res
        .status(400)
        .json({
          error: "Grupo Multisabor ou adicionais não pertence à loja atual.",
        });
      return;
    }
    const [row] = await db
      .insert(multiflavorGroupAddonGroupsTable)
      .values({
        storeId: actor.storeId,
        groupId,
        addonGroupId: addonGroup.id,
        sortOrder: Number(req.body.sortOrder ?? 0),
      })
      .onConflictDoUpdate({
        target: [
          multiflavorGroupAddonGroupsTable.storeId,
          multiflavorGroupAddonGroupsTable.groupId,
          multiflavorGroupAddonGroupsTable.addonGroupId,
        ],
        set: { sortOrder: Number(req.body.sortOrder ?? 0) },
      })
      .returning();
    res.status(201).json(row);
  },
);

router.delete(
  "/menu/multisabor/groups/:groupId/addon-groups/:linkId",
  async (req, res) => {
    const actor = await getCurrentActor(req);
    const groupId = positiveId(req.params.groupId),
      linkId = positiveId(req.params.linkId);
    const deleted = await db
      .delete(multiflavorGroupAddonGroupsTable)
      .where(
        and(
          eq(multiflavorGroupAddonGroupsTable.storeId, actor.storeId),
          eq(multiflavorGroupAddonGroupsTable.groupId, groupId ?? 0),
          eq(multiflavorGroupAddonGroupsTable.id, linkId ?? 0),
        ),
      )
      .returning({ id: multiflavorGroupAddonGroupsTable.id });
    if (!deleted.length) {
      res.status(404).json({ error: "Vínculo de adicionais não encontrado." });
      return;
    }
    res.status(204).end();
  },
);

export default router;
