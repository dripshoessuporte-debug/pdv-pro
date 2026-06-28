import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, fiscalGroupRulesTable, fiscalGroupsTable, orderItemsTable, ordersTable, paymentsTable, productFiscalSettingsTable, productsTable, storeFiscalPresentationTable, storeFiscalSettingsTable } from "@workspace/db";
import { getFocusCompanySummary } from "./company-service";
import { getHomologationRuleMode, isFiscalRuleComplete } from "./readiness";
import { FOCUS_NFCE_PAYMENT_CODES, FOCUS_NFCE_REF_MAX_LENGTH, FOCUS_NFCE_REF_PATTERN, FOCUS_NFCE_REQUIRED_ISSUER_FIELDS } from "./nfce-contract";
import { NfceServiceError, type FiscalMode } from "./nfce-types";

type DbExecutor = Pick<typeof db, "select">;
const paymentMap: Record<string,string> = { ...FOCUS_NFCE_PAYMENT_CODES };
const PLATFORM_PAYMENT_MESSAGE = "Pagamento online de plataforma ainda precisa de mapeamento fiscal antes da emissão.";
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const money = (c: number) => (c/100).toFixed(2);
export function stableNfceReference(storeId:number, orderId:number){ const ref = `gm-nfce-hom-${storeId}-${orderId}`.slice(0, FOCUS_NFCE_REF_MAX_LENGTH); if (!FOCUS_NFCE_REF_PATTERN.test(ref)) throw new NfceServiceError("FISCAL_SETUP_NOT_READY", "Referência fiscal inválida para a Focus NFC-e."); return ref; }
export function payloadHash(payload: unknown){ return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"); }
export async function assertHomologationSetupReady(storeId:number) {
  const summary = await getFocusCompanySummary(storeId);
  if (!summary.readyForHomologationTest) throw new NfceServiceError("FISCAL_SETUP_NOT_READY", "Configuração fiscal não está pronta para homologação.");
}
export async function buildHomologationNfcePayload(input:{ db: DbExecutor; storeId:number; orderId:number; series:number; number:number }) {
  const executor = input.db;
  const { storeId, orderId, series, number } = input;
  const [settings] = await executor.select().from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId, storeId)).limit(1);
  const [presentation] = await executor.select().from(storeFiscalPresentationTable).where(eq(storeFiscalPresentationTable.storeId, storeId)).limit(1);
  const mode = getHomologationRuleMode(presentation) as FiscalMode;
  if (!settings?.providerCompanyId || !settings.cscId || !settings.cscSecretReference || !settings.certificateReference || !["submitted","valid"].includes(settings.certificateStatus ?? "") || !settings.series || !settings.nextNumber || !settings.natureOperation) throw new NfceServiceError("FISCAL_SETUP_NOT_READY", "Configuração fiscal não está pronta para homologação.");
  const missingIssuer = FOCUS_NFCE_REQUIRED_ISSUER_FIELDS.filter((field) => !settings[field]);
  if (missingIssuer.length) { const error = new NfceServiceError("FISCAL_SETUP_NOT_READY", "Dados do emitente incompletos para NFC-e Focus: issuer_data_incomplete."); (error as any).missingRequirements = ["issuer_data_incomplete"]; throw error; }
  const [order] = await executor.select().from(ordersTable).where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId))).limit(1);
  if (!order || order.status === "cancelled" || order.status === "canceled") throw new NfceServiceError("ORDER_NOT_FOUND", "Pedido não encontrado.", 404);
  const items = (await executor.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId))) as any[];
  if (!items.length) throw new NfceServiceError("ORDER_HAS_NO_ITEMS", "Pedido sem itens fiscais.");
  if (items.some(i => i.productId == null)) throw new NfceServiceError("EXTERNAL_ITEM_FISCAL_MAPPING_REQUIRED", "Itens externos exigem mapeamento fiscal.");
  const payments = (await executor.select().from(paymentsTable).where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "approved")))) as any[];
  if (!payments.length) throw new NfceServiceError("ORDER_NOT_PAID", "Pedido não possui pagamento aprovado.");
  const delivery = cents(order.deliveryFee);
  if (delivery > 0) throw new NfceServiceError("DELIVERY_FEE_FISCAL_MAPPING_REQUIRED", "A taxa de entrega ainda precisa de configuração fiscal antes da emissão da NFC-e.");
  const pagamentos = payments.map(p => { if (p.method === "ifood_online" || p.method === "platform") throw new NfceServiceError("PAYMENT_METHOD_UNSUPPORTED", PLATFORM_PAYMENT_MESSAGE, 400); const forma_pagamento = paymentMap[p.method]; if (!forma_pagamento) throw new NfceServiceError("PAYMENT_METHOD_UNSUPPORTED", "Método de pagamento não suportado.", 400); return { forma_pagamento, valor_pagamento: money(cents(p.amount)), valor_troco: p.change ? money(cents(p.change)) : undefined }; });
  const itemTotal = items.reduce((s,i)=>s+cents(i.totalPrice),0); const fiscalTotal = itemTotal; const orderTotal = cents(order.totalAmount); const paid = payments.reduce((s,p)=>s+cents(p.amount)-cents(p.change),0);
  if (orderTotal <= 0 || fiscalTotal !== orderTotal || paid !== fiscalTotal) throw new NfceServiceError("ORDER_TOTAL_MISMATCH", "Totais do pedido, itens, entrega e pagamentos não fecham.");
  const productIds = items.map(i=>i.productId!).filter((v,i,a)=>a.indexOf(v)===i);
  const rules = (await executor.select().from(productFiscalSettingsTable).where(and(eq(productFiscalSettingsTable.storeId, storeId), inArray(productFiscalSettingsTable.productId, productIds)))) as any[];
  const products = (await executor.select({ id: productsTable.id, name: productsTable.name, storeId: productsTable.storeId }).from(productsTable).where(and(eq(productsTable.storeId, storeId), inArray(productsTable.id, productIds)))) as any[];
  const byProduct = new Map(rules.map(r=>[r.productId,r])); const productNames = new Map(products.map(p=>[p.id,p.name]));
  if (products.length !== productIds.length) throw new NfceServiceError("PRODUCT_FISCAL_RULE_MISSING", "Produto sem regra fiscal completa.");
  let itemsPayload: Record<string,unknown>[] = [];
  if (mode === "complete") {
    itemsPayload = items.map((i,idx)=>{ const r=byProduct.get(i.productId!); if(!r || !isFiscalRuleComplete(r)) throw new NfceServiceError("PRODUCT_FISCAL_RULE_MISSING", "Produto sem regra fiscal completa."); const desc=[productNames.get(i.productId!) ?? i.externalProductName, i.variantName].filter(Boolean).join(" - "); return buildFocusNfceFiscalLineForTests(idx+1, i.productId!, desc, i.quantity, cents(i.totalPrice), r); });
  } else {
    const groupIds = [...new Set(rules.map(r=>r.fiscalGroupId).filter((x):x is number=>x!=null))];
    if (rules.length !== productIds.length || groupIds.length === 0) throw new NfceServiceError("FISCAL_GROUP_RULE_MISSING", "Produto sem grupo fiscal.");
    const groupRules = (await executor.select().from(fiscalGroupRulesTable).where(and(eq(fiscalGroupRulesTable.storeId, storeId), inArray(fiscalGroupRulesTable.fiscalGroupId, groupIds)))) as any[];
    const groups = (await executor.select({ id:fiscalGroupsTable.id, name:fiscalGroupsTable.name }).from(fiscalGroupsTable).where(and(eq(fiscalGroupsTable.storeId, storeId), inArray(fiscalGroupsTable.id, groupIds)))) as any[];
    const byGroup = new Map(groupRules.map(r=>[r.fiscalGroupId,r])); const groupNames = new Map(groups.map(g=>[g.id,g.name])); const grouped = new Map<number,{q:number,total:number}>();
    for (const i of items) { const gid=byProduct.get(i.productId!)?.fiscalGroupId; const gr=gid?byGroup.get(gid):undefined; if(!gid || !gr || !isFiscalRuleComplete(gr) || !groupNames.has(gid)) throw new NfceServiceError("FISCAL_GROUP_RULE_MISSING", "Grupo fiscal sem regra completa."); const g=grouped.get(gid)??{q:0,total:0}; g.q+=i.quantity; g.total+=cents(i.totalPrice); grouped.set(gid,g); }
    itemsPayload = [...grouped.entries()].map(([gid,g],idx)=>buildFocusNfceFiscalLineForTests(idx+1, gid, groupNames.get(gid)!, g.q, g.total, byGroup.get(gid)!));
  }
  return { cnpj_emitente: settings.cnpj, natureza_operacao: settings.natureOperation, data_emissao: new Date().toISOString(), tipo_documento:"1", finalidade_emissao:"1", consumidor_final:"1", presenca_comprador:"1", modalidade_frete:"9", serie: String(series), numero: String(number), ambiente:"2", items: itemsPayload, formas_pagamento: pagamentos };
}
export function buildFocusNfceFiscalLineForTests(n:number, code:number, desc:string, qty:number, total:number, r:any){ if (qty <= 0 || total % qty !== 0) throw new NfceServiceError("ORDER_TOTAL_MISMATCH", "Totais do pedido, itens, entrega e pagamentos não fecham."); return { numero_item:String(n), codigo_produto:String(code), descricao:desc, ncm:r.ncm, cest:r.cest ?? undefined, cfop:r.cfop, unidade_comercial:r.commercialUnit, quantidade_comercial:qty.toFixed(4), valor_unitario_comercial:money(total/qty), valor_bruto:money(total), unidade_tributavel:r.commercialUnit, quantidade_tributavel:qty.toFixed(4), valor_unitario_tributavel:money(total/qty), inclui_no_total:"1", icms_origem:r.origin, icms_situacao_tributaria:r.icmsCode, pis_situacao_tributaria:r.pisCode, cofins_situacao_tributaria:r.cofinsCode }; }
