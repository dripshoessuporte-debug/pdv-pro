import { eq } from "drizzle-orm";
import { db, storesTable } from "@workspace/db";

export const getDefaultStoreIdOrThrow = async (): Promise<number> => {
  const [defaultStore] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.slug, "default-store"))
    .limit(1);

  if (defaultStore) return defaultStore.id;

  const [firstActiveStore] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.status, "active"))
    .limit(1);

  if (firstActiveStore) return firstActiveStore.id;

  throw new Error("Nenhuma loja ativa encontrada para vincular os dados de cardápio.");
};

// Planejado para uso na etapa de onboarding por loja.
export const seedDefaultStoreData = async (_storeId: number): Promise<void> => {
  return;
};
