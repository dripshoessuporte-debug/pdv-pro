import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  fiscalAuditLogsTable,
  storeFiscalPresentationTable,
  storeFiscalSettingsTable,
} from "@workspace/db";
import { requireRole, resolveCurrentActor } from "../middleware/rbac";
import { requireStoreFeature } from "../lib/store-features";

const router: IRouter = Router();

const fiscalItemizationModes = new Set(["simplified", "complete"]);
const taxRegimeToCrt: Record<string, string> = {
  simples_nacional: "1",
  simples_excesso: "2",
  regime_normal: "3",
};
const brazilianStates = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

const clean = (value: unknown, maxLength = 180): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";
const digits = (value: unknown): string => clean(value, 40).replace(/\D/g, "");

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isValidCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;

  const calculateDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calculateDigit(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(`${value.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return value.endsWith(`${first}${second}`);
}

type FiscalSettingsPayload = {
  itemizationMode: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  taxRegime: string;
  state: string;
  city: string;
  cityIbgeCode: string;
  postalCode: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  series: number | null;
  nextNumber: number | null;
  natureOperation: string;
};

function normalizePayload(body: unknown): FiscalSettingsPayload {
  const source = (body ?? {}) as Record<string, unknown>;
  return {
    itemizationMode: clean(source.itemizationMode, 20).toLowerCase(),
    legalName: clean(source.legalName),
    tradeName: clean(source.tradeName),
    cnpj: digits(source.cnpj),
    stateRegistration: clean(source.stateRegistration, 40).toUpperCase(),
    taxRegime: clean(source.taxRegime, 40).toLowerCase(),
    state: clean(source.state, 2).toUpperCase(),
    city: clean(source.city, 100),
    cityIbgeCode: digits(source.cityIbgeCode),
    postalCode: digits(source.postalCode),
    street: clean(source.street, 160),
    number: clean(source.number, 30),
    neighborhood: clean(source.neighborhood, 100),
    complement: clean(source.complement, 120),
    series: parsePositiveInteger(source.series),
    nextNumber: parsePositiveInteger(source.nextNumber),
    natureOperation: clean(source.natureOperation, 120),
  };
}

function validatePayload(payload: FiscalSettingsPayload): Array<{
  field: keyof FiscalSettingsPayload;
  message: string;
}> {
  const errors: Array<{ field: keyof FiscalSettingsPayload; message: string }> = [];
  const required = (
    field: keyof FiscalSettingsPayload,
    message: string,
  ): void => {
    if (!payload[field]) errors.push({ field, message });
  };

  if (!fiscalItemizationModes.has(payload.itemizationMode)) {
    errors.push({
      field: "itemizationMode",
      message: "Escolha o modelo fiscal Simplificado ou Completo.",
    });
  }
  required("legalName", "Informe a razão social.");
  if (!isValidCnpj(payload.cnpj)) {
    errors.push({ field: "cnpj", message: "Informe um CNPJ válido com 14 dígitos." });
  }
  required("stateRegistration", "Informe a Inscrição Estadual ou ISENTO.");
  if (!taxRegimeToCrt[payload.taxRegime]) {
    errors.push({ field: "taxRegime", message: "Selecione o regime tributário." });
  }
  if (!brazilianStates.has(payload.state)) {
    errors.push({ field: "state", message: "Selecione uma UF válida." });
  }
  required("city", "Informe o município.");
  if (!/^\d{7}$/.test(payload.cityIbgeCode)) {
    errors.push({ field: "cityIbgeCode", message: "O código IBGE deve ter 7 dígitos." });
  }
  if (!/^\d{8}$/.test(payload.postalCode)) {
    errors.push({ field: "postalCode", message: "O CEP deve ter 8 dígitos." });
  }
  required("street", "Informe o logradouro.");
  required("number", "Informe o número do endereço.");
  required("neighborhood", "Informe o bairro.");
  if (!payload.series || payload.series > 999) {
    errors.push({ field: "series", message: "A série deve estar entre 1 e 999." });
  }
  if (!payload.nextNumber) {
    errors.push({ field: "nextNumber", message: "Informe a próxima numeração da NFC-e." });
  }
  required("natureOperation", "Informe a natureza da operação.");
  return errors;
}

async function readFiscalSettings(storeId: number) {
  const [settings] = await db
    .select()
    .from(storeFiscalSettingsTable)
    .where(eq(storeFiscalSettingsTable.storeId, storeId))
    .limit(1);
  const [presentation] = await db
    .select({ mode: storeFiscalPresentationTable.mode })
    .from(storeFiscalPresentationTable)
    .where(eq(storeFiscalPresentationTable.storeId, storeId))
    .limit(1);

  return {
    configured: Boolean(settings),
    setupStatus: settings?.setupStatus ?? "not_configured",
    environment: settings?.environment ?? "homologation",
    emissionMode: settings?.emissionMode ?? "manual",
    itemizationMode: presentation?.mode ?? "simplified",
    legalName: settings?.legalName ?? "",
    tradeName: settings?.tradeName ?? "",
    cnpj: settings?.cnpj ?? "",
    stateRegistration: settings?.stateRegistration ?? "",
    taxRegime: settings?.taxRegime ?? "",
    crt: settings?.crt ?? "",
    state: settings?.state ?? "",
    city: settings?.city ?? "",
    cityIbgeCode: settings?.cityIbgeCode ?? "",
    postalCode: settings?.postalCode ?? "",
    street: settings?.street ?? "",
    number: settings?.number ?? "",
    neighborhood: settings?.neighborhood ?? "",
    complement: settings?.complement ?? "",
    series: settings?.series ?? 1,
    nextNumber: settings?.nextNumber ?? 1,
    natureOperation: settings?.natureOperation ?? "Venda de mercadoria",
  };
}

router.get(
  "/fiscal/access",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (_req, res): Promise<void> => {
    const access = res.locals.storeFeatureAccess;
    const settings = await readFiscalSettings(access.storeId);
    res.json({
      feature: "fiscal",
      allowed: true,
      storeId: access.storeId,
      plan: access.plan,
      status: access.status,
      setup: settings,
    });
  },
);

router.get(
  "/fiscal/settings",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (_req, res): Promise<void> => {
    const access = res.locals.storeFeatureAccess;
    res.json({ settings: await readFiscalSettings(access.storeId) });
  },
);

router.put(
  "/fiscal/settings",
  requireRole("max_control"),
  requireStoreFeature("fiscal"),
  async (req, res): Promise<void> => {
    const actor = await resolveCurrentActor(req);
    const payload = normalizePayload(req.body);
    const errors = validatePayload(payload);
    if (errors.length > 0) {
      res.status(400).json({
        error: "Revise os dados da configuração fiscal.",
        code: "FISCAL_SETTINGS_INVALID",
        fields: errors,
      });
      return;
    }

    const crt = taxRegimeToCrt[payload.taxRegime];
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .insert(storeFiscalSettingsTable)
        .values({
          storeId: actor.storeId,
          setupStatus: "configuring",
          provider: "focus_nfe",
          environment: "homologation",
          emissionMode: "manual",
          legalName: payload.legalName,
          tradeName: payload.tradeName || null,
          cnpj: payload.cnpj,
          stateRegistration: payload.stateRegistration,
          taxRegime: payload.taxRegime,
          crt,
          state: payload.state,
          city: payload.city,
          cityIbgeCode: payload.cityIbgeCode,
          postalCode: payload.postalCode,
          street: payload.street,
          number: payload.number,
          neighborhood: payload.neighborhood,
          complement: payload.complement || null,
          series: payload.series,
          nextNumber: payload.nextNumber,
          natureOperation: payload.natureOperation,
          configuredByUserId: actor.id,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: storeFiscalSettingsTable.storeId,
          set: {
            setupStatus: "configuring",
            environment: "homologation",
            emissionMode: "manual",
            legalName: payload.legalName,
            tradeName: payload.tradeName || null,
            cnpj: payload.cnpj,
            stateRegistration: payload.stateRegistration,
            taxRegime: payload.taxRegime,
            crt,
            state: payload.state,
            city: payload.city,
            cityIbgeCode: payload.cityIbgeCode,
            postalCode: payload.postalCode,
            street: payload.street,
            number: payload.number,
            neighborhood: payload.neighborhood,
            complement: payload.complement || null,
            series: payload.series,
            nextNumber: payload.nextNumber,
            natureOperation: payload.natureOperation,
            configuredByUserId: actor.id,
            updatedAt: now,
          },
        });

      await tx
        .insert(storeFiscalPresentationTable)
        .values({
          storeId: actor.storeId,
          mode: payload.itemizationMode,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: storeFiscalPresentationTable.storeId,
          set: { mode: payload.itemizationMode, updatedAt: now },
        });

      await tx.insert(fiscalAuditLogsTable).values({
        storeId: actor.storeId,
        actorUserId: actor.id,
        action: "fiscal_settings_saved",
        targetType: "store_fiscal_settings",
        targetId: String(actor.storeId),
        metadata: {
          setupStatus: "configuring",
          environment: "homologation",
          emissionMode: "manual",
          itemizationMode: payload.itemizationMode,
          taxRegime: payload.taxRegime,
        },
      });
    });

    res.json({
      message: "Configuração fiscal inicial salva com segurança.",
      settings: await readFiscalSettings(actor.storeId),
    });
  },
);

export default router;
