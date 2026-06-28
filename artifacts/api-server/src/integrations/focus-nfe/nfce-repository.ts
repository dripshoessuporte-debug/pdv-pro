import { and, eq } from "drizzle-orm";
import { db, fiscalAuditLogsTable, fiscalDocumentsTable, storeFiscalSettingsTable } from "@workspace/db";
import { assertHomologationSetupReady, buildHomologationNfcePayload, payloadHash, stableNfceReference } from "./nfce-payload";
import { NfceServiceError, type SafeNfceDocument } from "./nfce-types";
export const toSafeNfceDocument = (d: typeof fiscalDocumentsTable.$inferSelect): SafeNfceDocument => ({ id:d.id, orderId:d.orderId, environment:d.environment, status:d.status, series:d.series, number:d.number, accessKey:d.accessKey, protocol:d.protocol, xmlAvailable:Boolean(d.xmlUrl), danfceAvailable:Boolean(d.danfceUrl), rejectionCode:d.rejectionCode, rejectionMessage:d.rejectionMessage, authorizedAt:d.authorizedAt, lastCheckedAt:d.lastCheckedAt });
export async function findNfceDocument(storeId:number, orderId:number){ const [d]=await db.select().from(fiscalDocumentsTable).where(and(eq(fiscalDocumentsTable.storeId,storeId),eq(fiscalDocumentsTable.orderId,orderId),eq(fiscalDocumentsTable.documentType,"nfce"),eq(fiscalDocumentsTable.environment,"homologation"))).limit(1); return d; }
function isUniqueConflict(error:unknown){ return typeof error === "object" && error !== null && ["23505","SQLITE_CONSTRAINT","SQLITE_CONSTRAINT_UNIQUE"].includes(String((error as any).code)); }
export async function reserveHomologationNfce(storeId:number, orderId:number, userId:number){
  await assertHomologationSetupReady(storeId);
  try {
    return await db.transaction(async (tx:any)=>{
      const [settings]=await tx.select().from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId,storeId)).for("update").limit(1);
      if (!settings?.series || !settings.nextNumber) throw new NfceServiceError("FISCAL_SETUP_NOT_READY", "Configuração fiscal não está pronta para homologação.");
      const [existing]=await tx.select().from(fiscalDocumentsTable).where(and(eq(fiscalDocumentsTable.storeId,storeId),eq(fiscalDocumentsTable.orderId,orderId),eq(fiscalDocumentsTable.documentType,"nfce"),eq(fiscalDocumentsTable.environment,"homologation"))).limit(1);
      if (existing) return existing;
      const payload=await buildHomologationNfcePayload({ db:tx, storeId, orderId, series:settings.series, number:settings.nextNumber });
      const [doc]=await tx.insert(fiscalDocumentsTable).values({ storeId, orderId, provider:"focus_nfe", documentType:"nfce", environment:"homologation", providerReference: stableNfceReference(storeId, orderId), status:"draft", series:settings.series, number:settings.nextNumber, payloadVersion:"focus-nfe-v2-nfce-homologation-1", payloadHash:payloadHash(payload), payloadSnapshot:payload, createdByUserId:userId }).returning();
      await tx.update(storeFiscalSettingsTable).set({ nextNumber: settings.nextNumber + 1 }).where(eq(storeFiscalSettingsTable.id, settings.id));
      await tx.insert(fiscalAuditLogsTable).values({ storeId, actorUserId:userId, action:"nfce_homologation_reserved", targetType:"fiscal_document", targetId:String(doc.id), metadata:{ orderId, fiscalDocumentId:doc.id, status:doc.status, series:doc.series, number:doc.number, providerReference:doc.providerReference } });
      return doc;
    });
  } catch (error) {
    if (isUniqueConflict(error)) { const existing = await findNfceDocument(storeId, orderId); if (existing) return existing; }
    throw error;
  }
}
export async function audit(storeId:number,userId:number|null,action:string,docId:number,metadata:Record<string,unknown>={}){ const safe = Object.fromEntries(Object.entries(metadata).filter(([k])=>!["payloadSnapshot","token","authorization","csc","certificate","password","rawResponse"].includes(k.toLowerCase()))); await db.insert(fiscalAuditLogsTable).values({ storeId, actorUserId:userId, action, targetType:"fiscal_document", targetId:String(docId), metadata:safe }); }
