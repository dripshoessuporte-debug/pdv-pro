#!/usr/bin/env node
const enabled = process.env.FOCUS_NFE_SMOKE_ENABLED === "true";
const token = process.env.FOCUS_NFE_SMOKE_TOKEN;
const ref = process.env.FOCUS_NFE_SMOKE_REF;
if (!enabled || !token || !ref) {
  console.log(JSON.stringify({ skipped: true, reason: "Set FOCUS_NFE_SMOKE_ENABLED=true, FOCUS_NFE_SMOKE_TOKEN and FOCUS_NFE_SMOKE_REF to run the manual homologation smoke." }));
  process.exit(0);
}
const payload = {
  cnpj_emitente: process.env.FOCUS_NFE_SMOKE_CNPJ ?? "00000000000000",
  natureza_operacao: "VENDA AO CONSUMIDOR",
  data_emissao: new Date().toISOString(),
  tipo_documento: "1",
  finalidade_emissao: "1",
  consumidor_final: "1",
  presenca_comprador: "1",
  modalidade_frete: "9",
  items: [{ numero_item: "1", codigo_produto: "SMOKE", descricao: "PRODUTO HOMOLOGACAO", ncm: "19059090", cfop: "5102", unidade_comercial: "UN", quantidade_comercial: "1.0000", valor_unitario_comercial: "1.00", valor_bruto: "1.00", unidade_tributavel: "UN", quantidade_tributavel: "1.0000", valor_unitario_tributavel: "1.00", inclui_no_total: "1", icms_origem: "0", icms_situacao_tributaria: "102", pis_situacao_tributaria: "49", cofins_situacao_tributaria: "49" }],
  formas_pagamento: [{ forma_pagamento: "01", valor_pagamento: "1.00" }],
};
const auth = Buffer.from(`${token}:`).toString("base64");
const res = await fetch(`https://homologacao.focusnfe.com.br/v2/nfce?ref=${encodeURIComponent(ref)}`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
let body = {};
try { body = await res.json(); } catch {}
console.log(JSON.stringify({ httpStatus: res.status, status: body.status ?? null, status_sefaz: body.status_sefaz ?? null, hasAccessKey: Boolean(body.chave_nfe), hasXml: Boolean(body.caminho_xml_nota_fiscal), hasDanfce: Boolean(body.caminho_danfe || body.caminho_danfce) }));
