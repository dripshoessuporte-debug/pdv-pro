import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, fiscalGroupRulesTable, orderItemsTable, ordersTable, paymentsTable, productFiscalSettingsTable, storeFiscalPresentationTable, storeFiscalSettingsTable } from "@workspace/db";
import { NfceServiceError, type FiscalMode } from "./nfce-types";

const paymentMap: Record<string,string> = { cash:"01", credit_card:"03", debit_card:"04", voucher:"10", pix:"17", ifood_online:"17", platform:"17" };
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const money = (c: number) => (c/100).toFixed(2);
function isRuleComplete(r: { ncm?:string|null; cfop?:string|null; commercialUnit?:string|null; origin?:string|null; icmsCode?:string|null; pisCode?:string|null; cofinsCode?:string|null }|undefined) { return Boolean(r?.ncm && r.cfop && r.commercialUnit && r.origin && r.icmsCode && r.pisCode && r.cofinsCode); }
export function stableNfceReference(storeId:number, orderId:number){ return `gm-nfce-hom-${storeId}-${orderId}`.slice(0,60); }
export function payloadHash(payload: unknown){ return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"); }
export async function buildHomologationNfcePayload(storeId:number, orderId:number, series:number, number:number) {
  const [settings] = await db.select().from(storeFiscalSettingsTable).where(eq(storeFiscalSettingsTable.storeId, storeId)).limit(1);
  const [presentation] = await db.select().from(storeFiscalPresentationTable).where(eq(storeFiscalPresentationTable.storeId, storeId)).limit(1);
  const mode = (presentation?.mode === "complete" ? "complete" : "simplified") as FiscalMode;
  if (!settings?.providerCompanyId || !settings.cscId || !settings.cscSecretReference || !settings.certificateReference || !["submitted","valid"].includes(settings.certificateStatus ?? "") || !settings.series || !settings.nextNumber || !settings.natureOperation) throw new NfceServiceError("FISCAL_SETUP_NOT_READY", "Configuração fiscal não está pronta para homologação.");
  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId))).limit(1);
  if (!order) throw new NfceServiceError("ORDER_NOT_FOUND", "Pedido não encontrado.", 404);
  if (order.status === "cancelled" || order.status === "canceled") throw new NfceServiceError("ORDER_NOT_FOUND", "Pedido não encontrado.", 404);
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  if (!items.length) throw new NfceServiceError("ORDER_HAS_NO_ITEMS", "Pedido sem itens fiscais.");
  if (items.some(i => i.productId == null)) throw new NfceServiceError("EXTERNAL_ITEM_FISCAL_MAPPING_REQUIRED", "Itens externos exigem mapeamento fiscal.");
  const payments = await db.select().from(paymentsTable).where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "approved")));
  if (!payments.length) throw new NfceServiceError("ORDER_NOT_PAID", "Pedido não possui pagamento aprovado.");
  const pagamentos = payments.map(p => { const forma_pagamento = paymentMap[p.method]; if (!forma_pagamento) throw new NfceServiceError("PAYMENT_METHOD_UNSUPPORTED", "Método de pagamento não suportado.", 400); return { forma_pagamento, valor_pagamento: money(cents(p.amount)), troco: p.change ? money(cents(p.change)) : undefined }; });
  const itemTotal = items.reduce((s,i)=>s+cents(i.totalPrice),0); const delivery = cents(order.deliveryFee); const fiscalTotal = itemTotal + delivery; const orderTotal = cents(order.totalAmount); const paid = payments.reduce((s,p)=>s+cents(p.amount)-cents(p.change),0);
  if (orderTotal <= 0 || fiscalTotal !== orderTotal || paid !== fiscalTotal) throw new NfceServiceError("ORDER_TOTAL_MISMATCH", "Totais do pedido, itens, entrega e pagamentos não fecham.");
  const productIds = items.map(i=>i.productId!).filter((v,i,a)=>a.indexOf(v)===i);
  const rules = await db.select().from(productFiscalSettingsTable).where(and(eq(productFiscalSettingsTable.storeId, storeId), inArray(productFiscalSettingsTable.productId, productIds)));
  const byProduct = new Map(rules.map(r=>[r.productId,r]));
  let produtos: Record<string,unknown>[] = [];
  if (mode === "complete") {
    produtos = items.map((i,idx)=>{ const r=byProduct.get(i.productId!); if(!isRuleComplete(r)) throw new NfceServiceError("PRODUCT_FISCAL_RULE_MISSING", "Produto sem regra fiscal completa."); return fiscalLine(idx+1, i.productId!, i.externalProductName ?? `Produto ${i.productId}`, i.quantity, cents(i.totalPrice), r!); });
  } else {
    const groupIds = [...new Set(rules.map(r=>r.fiscalGroupId).filter((x):x is number=>x!=null))];
    if (rules.length !== productIds.length || groupIds.length === 0) throw new NfceServiceError("FISCAL_GROUP_RULE_MISSING", "Produto sem grupo fiscal.");
    const groupRules = await db.select().from(fiscalGroupRulesTable).where(and(eq(fiscalGroupRulesTable.storeId, storeId), inArray(fiscalGroupRulesTable.fiscalGroupId, groupIds)));
    const byGroup = new Map(groupRules.map(r=>[r.fiscalGroupId,r])); const grouped = new Map<number,{q:number,total:number}>();
    for (const i of items) { const gid=byProduct.get(i.productId!)?.fiscalGroupId; const gr=gid?byGroup.get(gid):undefined; if(!gid || !isRuleComplete(gr)) throw new NfceServiceError("FISCAL_GROUP_RULE_MISSING", "Grupo fiscal sem regra completa."); const g=grouped.get(gid)??{q:0,total:0}; g.q+=i.quantity; g.total+=cents(i.totalPrice); grouped.set(gid,g); }
    produtos = [...grouped.entries()].map(([gid,g],idx)=>fiscalLine(idx+1, gid, `Grupo fiscal ${gid}`, g.q, g.total, byGroup.get(gid)!));
  }
  if (delivery > 0) produtos.push({ numero_item: String(produtos.length+1), codigo_produto:"DELIVERY", descricao:"Taxa de entrega", cfop: "5933", unidade_comercial:"UN", quantidade_comercial:"1.0000", valor_unitario_comercial: money(delivery), valor_bruto: money(delivery) });
  return { natureza_operacao: settings.natureOperation, data_emissao: new Date().toISOString(), tipo_documento:"1", finalidade_emissao:"1", consumidor_final:"1", presenca_comprador:"1", modalidade_frete:"9", serie: String(series), numero: String(number), ambiente:"2", produtos, formas_pagamento: pagamentos };
}
function fiscalLine(n:number, code:number, desc:string, qty:number, total:number, r:any){ return { numero_item:String(n), codigo_produto:String(code), descricao:desc, ncm:r.ncm, cest:r.cest ?? undefined, cfop:r.cfop, unidade_comercial:r.commercialUnit, quantidade_comercial:qty.toFixed(4), valor_unitario_comercial:money(Math.round(total/qty)), valor_bruto:money(total), icms_origem:r.origin, icms_situacao_tributaria:r.icmsCode, pis_situacao_tributaria:r.pisCode, cofins_situacao_tributaria:r.cofinsCode }; }
