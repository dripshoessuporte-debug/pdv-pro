import { eq } from "drizzle-orm";
import { db, storeSettingsTable, type StoreSettings } from "@workspace/db";
import { normalizeCep } from "./delivery-fee";

export const INVALID_STORE_CEP_DELIVERY_ERROR =
  "Configure um CEP válido da loja em Configurações para calcular entregas.";

export type StoreDeliveryOrigin = {
  settings: StoreSettings;
  storeCep: string;
  address: {
    cep: string;
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    fullAddress: string;
  };
};

async function getOrCreateStoreSettings(storeId: number): Promise<StoreSettings> {
  const [existing] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.storeId, storeId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(storeSettingsTable)
    .values({ storeId })
    .returning();
  return created;
}

function stringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export async function getStoreDeliveryOrigin(
  storeId: number,
): Promise<StoreDeliveryOrigin> {
  const settings = await getOrCreateStoreSettings(storeId);
  const storeCep = normalizeCep(String(settings.storeCep ?? ""));

  if (!storeCep) {
    throw new Error(INVALID_STORE_CEP_DELIVERY_ERROR);
  }

  const street = stringOrNull(settings.storeAddress);
  const number = stringOrNull(settings.storeNumber);
  const neighborhood = stringOrNull(settings.storeNeighborhood);
  const city = stringOrNull(settings.storeCity);
  const state = stringOrNull(settings.storeState);
  const country = stringOrNull(settings.storeCountry) ?? "Brasil";
  const fullAddress = [
    storeCep,
    street,
    number,
    neighborhood,
    city,
    state,
    country,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    settings,
    storeCep,
    address: {
      cep: storeCep,
      street,
      number,
      neighborhood,
      city,
      state,
      country,
      fullAddress,
    },
  };
}
