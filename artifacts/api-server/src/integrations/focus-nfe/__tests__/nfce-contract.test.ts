import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildFocusNfceFiscalLineForTests, multisaborFiscalDescriptionForTests, multisaborFiscalReferenceForTests, stableNfceReference } from "../nfce-payload";
import { FOCUS_NFCE_ENDPOINTS, FOCUS_NFCE_PAYMENT_CODES, FOCUS_NFCE_REF_PATTERN, normalizeFocusNfceStatus } from "../nfce-contract";

const payloadSource = readFileSync(resolve("src/integrations/focus-nfe/nfce-payload.ts"), "utf8");
const serviceSource = readFileSync(resolve("src/integrations/focus-nfe/nfce-service.ts"), "utf8");
const contractSource = readFileSync(resolve("src/integrations/focus-nfe/nfce-contract.ts"), "utf8");
const smokeSource = readFileSync(resolve("scripts/focus-nfce-contract-smoke.mjs"), "utf8");
const sampleRule = { ncm: "19059090", cest: null, cfop: "5102", commercialUnit: "UN", origin: "0", icmsCode: "102", pisCode: "49", cofinsCode: "49" };

test("endpoints oficiais de NFC-e usam POST /v2/nfce?ref e GET/DELETE /v2/nfce/{referencia}", () => {
  assert.equal(FOCUS_NFCE_ENDPOINTS.createMethod, "POST");
  assert.equal(FOCUS_NFCE_ENDPOINTS.createPath, "/v2/nfce");
  assert.equal(FOCUS_NFCE_ENDPOINTS.createRefQueryParam, "ref");
  assert.equal(FOCUS_NFCE_ENDPOINTS.consultMethod, "GET");
  assert.equal(FOCUS_NFCE_ENDPOINTS.consultPath("abc-123"), "/v2/nfce/abc-123");
  assert.equal(FOCUS_NFCE_ENDPOINTS.cancelMethod, "DELETE");
});

test("referência local fica no limite e caracteres auditados", () => {
  const ref = stableNfceReference(123456789, 987654321);
  assert.ok(ref.length <= 60);
  assert.match(ref, FOCUS_NFCE_REF_PATTERN);
});

test("payload usa items oficial e não produtos/itens antigos", () => {
  assert.match(payloadSource, /items: itemsPayload/);
  assert.doesNotMatch(payloadSource, /\bprodutos\b/);
  assert.doesNotMatch(payloadSource, /\bitens\s*:/);
  assert.doesNotMatch(payloadSource, /codigo_ncm/);
});

test("item completo possui campos oficiais obrigatórios auditados", () => {
  const item = buildFocusNfceFiscalLineForTests(1, 10, "Produto", 2, 1000, sampleRule) as Record<string, unknown>;
  for (const field of ["numero_item", "codigo_produto", "descricao", "ncm", "cfop", "unidade_comercial", "quantidade_comercial", "valor_unitario_comercial", "valor_bruto", "unidade_tributavel", "quantidade_tributavel", "valor_unitario_tributavel", "inclui_no_total", "icms_origem", "icms_situacao_tributaria", "pis_situacao_tributaria", "cofins_situacao_tributaria"]) {
    assert.ok(field in item, field);
  }
});

test("códigos oficiais de pagamento permanecem mapeados", () => {
  assert.equal(FOCUS_NFCE_PAYMENT_CODES.pix, "17");
  assert.equal(FOCUS_NFCE_PAYMENT_CODES.cash, "01");
  assert.equal(FOCUS_NFCE_PAYMENT_CODES.credit_card, "03");
  assert.equal(FOCUS_NFCE_PAYMENT_CODES.debit_card, "04");
  assert.equal(FOCUS_NFCE_PAYMENT_CODES.voucher, "10");
});

test("plataforma, iFood e taxa de entrega seguem bloqueados", () => {
  assert.match(payloadSource, /ifood_online/);
  assert.match(payloadSource, /platform/);
  assert.match(payloadSource, /DELIVERY_FEE_FISCAL_MAPPING_REQUIRED/);
  assert.doesNotMatch(payloadSource, /platform[\s\S]{0,80}pix|pix[\s\S]{0,80}platform/);
});

test("dados mínimos do emitente são enviados e ausência bloqueia antes da Focus", () => {
  assert.match(payloadSource, /cnpj_emitente: settings\.cnpj/);
  assert.match(payloadSource, /issuer_data_incomplete/);
  assert.match(payloadSource, /FISCAL_SETUP_NOT_READY/);
});

test("status oficial autorizado exige status, status_sefaz, chave, protocolo e artefato fiscal", () => {
  const n = normalizeFocusNfceStatus({ status: "autorizado", status_sefaz: "100", chave_nfe: "123", protocolo: "999", caminho_xml_nota_fiscal: "/arquivos/xml.xml", caminho_danfe: "/arquivos/danfe.pdf" });
  assert.equal(n.status, "authorized");
  assert.equal(n.xmlUrl, "/arquivos/xml.xml");
  assert.equal(n.danfceUrl, "/arquivos/danfe.pdf");
});

test("status rejeitado vira rejected e resposta ambígua não autoriza", () => {
  assert.equal(normalizeFocusNfceStatus({ status: "erro_autorizacao", status_sefaz: "539", mensagem_sefaz: "Rejeição" }).status, "rejected");
  assert.equal(normalizeFocusNfceStatus({ status: "autorizado", status_sefaz: "100" }).status, "processing");
  assert.equal(normalizeFocusNfceStatus({ status: "processando" }).status, "processing");
});

test("XML/DANFCE são mapeados dos campos oficiais e consulta é segurança, sem retry automático de POST", () => {
  assert.match(contractSource, /caminho_xml_nota_fiscal/);
  assert.match(contractSource, /caminho_danfe/);
  assert.doesNotMatch(serviceSource, /method:"POST"[\s\S]*method:"POST"/);
  assert.match(serviceSource, /FOCUS_NFCE_ENDPOINTS\.consultPath/);
});

test("script smoke é manual, protegido por variáveis e testes não chamam Focus real", () => {
  assert.match(smokeSource, /FOCUS_NFE_SMOKE_ENABLED/);
  assert.match(smokeSource, /FOCUS_NFE_SMOKE_TOKEN/);
  assert.match(smokeSource, /FOCUS_NFE_SMOKE_REF/);
  assert.doesNotMatch(smokeSource.replace(/reason: .*$/gm, "reason redacted"), /console\.log\([^)]*TOKEN|console\.log\([^)]*token/);
});

test("Multisabor usa primeiro sabor válido da loja como referência fiscal estável", () => {
  const item = { itemType: "multisabor", productId: null };
  const flavors = [
    { id: 30, productId: 300, sortOrder: 2, productNameSnapshot: "Quatro Queijos" },
    { id: 20, productId: 200, sortOrder: 1, productNameSnapshot: "Calabresa" },
  ];
  assert.equal(multisaborFiscalReferenceForTests(item, flavors, new Set([200, 300])), 200);
});

test("Multisabor monta descrição legível com tamanho e sabores sem recalcular preço", () => {
  const desc = multisaborFiscalDescriptionForTests(
    { itemType: "multisabor", displayName: "Pizza Multisabor Completa - 2 sabores", externalProductName: "Pizza Multisabor Completa", pizzaSizeName: "Grande" },
    [
      { id: 1, productId: 10, sortOrder: 0, productNameSnapshot: "Calabresa" },
      { id: 2, productId: 11, sortOrder: 1, productNameSnapshot: "Quatro Queijos" },
    ],
  );
  assert.equal(desc, "Pizza Multisabor Completa Grande - Calabresa / Quatro Queijos");
  const line = buildFocusNfceFiscalLineForTests(1, 10, desc, 1, 7990, sampleRule) as Record<string, unknown>;
  assert.equal(line.valor_bruto, "79.90");
  assert.equal(line.valor_unitario_comercial, "79.90");
});

test("Multisabor sem sabor ou com sabor fora da loja retorna erro seguro", () => {
  assert.throws(
    () => multisaborFiscalReferenceForTests({ itemType: "multisabor", productId: null }, [], new Set([1])),
    /Não foi possível emitir NFC-e: o item Multisabor não possui sabor com configuração fiscal válida\./,
  );
  assert.throws(
    () => multisaborFiscalReferenceForTests({ itemType: "multisabor", productId: null }, [{ productId: 99, productNameSnapshot: "Outra loja" }], new Set([1])),
    /Não foi possível emitir NFC-e: o item Multisabor não possui sabor com configuração fiscal válida\./,
  );
});

test("produção NFC-e exige readiness forte antes da Focus e usa ambiente production", () => {
  assert.match(serviceSource, /issueProduction/);
  assert.match(serviceSource, /FISCAL_PRODUCTION_NOT_READY/);
  assert.match(serviceSource, /readyForProduction/);
  assert.match(serviceSource, /environment === "production"/);
  assert.doesNotMatch(serviceSource, /console\.log/);
});

test("payload de produção usa ambiente 1 sem alterar montagem homologada", () => {
  assert.match(payloadSource, /environment === "production" \? "1" : "2"/);
  assert.match(payloadSource, /buildHomologationNfcePayload/);
  assert.match(payloadSource, /buildProductionNfcePayload/);
});

test("cancelamento seguro usa documento da loja, status autorizado, ambiente original e não expõe secrets", () => {
  assert.match(serviceSource, /cancelDocument\(documentId:number, actorStoreId:number/);
  assert.match(serviceSource, /findFiscalDocumentByIdForStore\(documentId, actorStoreId\)/);
  assert.match(serviceSource, /doc\.status!=="authorized"/);
  assert.match(serviceSource, /doc\.status==="cancelled"/);
  assert.match(serviceSource, /doc\.environment === "production" \? "production" : "homologation"/);
  assert.match(serviceSource, /resolveStoreFocusCredentials\(\{ storeId: actorStoreId, environment \}\)/);
  assert.match(serviceSource, /FOCUS_NFCE_ENDPOINTS\.cancelPath\(doc\.providerReference\)/);
  assert.match(serviceSource, /justificativa: justification/);
  assert.doesNotMatch(serviceSource, /rawResponse/);
});

test("cancelamento valida justificativa e persiste status cancelled sem migration", () => {
  const repositorySource = readFileSync(resolve("src/integrations/focus-nfe/nfce-repository.ts"), "utf8");
  const schemaSource = readFileSync(resolve("../../lib/db/src/schema/fiscal.ts"), "utf8");
  assert.match(serviceSource, /justification\.length < 15 \|\| justification\.length > 255/);
  assert.match(repositorySource, /findFiscalDocumentByIdForStore/);
  assert.match(repositorySource, /markFiscalDocumentCancelled/);
  assert.match(repositorySource, /status:"cancelled"/);
  assert.match(schemaSource, /"cancelled"/);
});
