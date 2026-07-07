import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./fiscal-focus.tsx", import.meta.url),
  "utf8",
);

test("página exibe loading, status concluído, pendente e bloqueio PRO", () => {
  assert.match(source, /Carregando status da integração/);
  assert.match(source, /Configuração pronta para o primeiro teste/);
  assert.match(source, /Produção bloqueada/);
  assert.match(source, /Acesso fiscal bloqueado pela assinatura/);
});

test("missingRequirements são traduzidos sem expor códigos técnicos na UI", () => {
  assert.match(source, /A empresa ainda não foi vinculada à Focus NFe\./);
  assert.match(source, /Existem produtos sem configuração fiscal completa\./);
  assert.match(source, /missingText\[m\]/);
});

test("tokens, senha do certificado, arquivo e CSC são limpos após requisições", () => {
  assert.match(source, /setCompany\(emptyCompany\)/);
  assert.match(source, /homologationToken: "", productionToken: ""/);
  assert.match(source, /setCertPassword\(""\)/);
  assert.match(source, /setFile\(null\)/);
  assert.match(source, /fileRef\.current\.value = ""/);
  assert.match(source, /setCsc\(emptyCsc\)/);
  assert.match(source, /cscSecret: ""/);
});

test("upload usa FormData real e não define Content-Type", () => {
  assert.match(source, /new FormData\(\)/);
  assert.match(source, /fd\.append\("certificate", file\)/);
  assert.match(source, /fd\.append\("certificatePassword", certPassword\)/);
  assert.doesNotMatch(source, /content-type": "multipart\/form-data/);
  assert.doesNotMatch(source, /base64|FileReader|localStorage|sessionStorage/);
});

test("duplo clique é bloqueado, troca de loja limpa campos sensíveis e nenhuma NFC-e é emitida", () => {
  assert.match(source, /if \(savingCompany\) return/);
  assert.match(source, /if \(savingCert\) return/);
  assert.match(source, /if \(savingCsc\) return/);
  assert.match(source, /\[storeKey, loadStatus, clearSensitive\]/);
  assert.match(source, /Emitir NFC-e de teste — disponível na próxima etapa/);
  assert.match(source, /disabled[\s\S]*title=/);
  assert.doesNotMatch(source, /\/api\/fiscal\/nfce\/.*\/issue|emitir[\s\S]{0,80}fetch/i);
});

test("diagnósticos de acesso fiscal mostram mensagens específicas", () => {
  assert.match(source, /Faça login novamente para acessar o Fiscal\./);
  assert.match(source, /Seu usuário não é Max Control nesta loja\./);
  assert.match(
    source,
    /O plano PRO foi encontrado, mas a assinatura não está ativa\./,
  );
  assert.match(source, /Código: \{error\.code\}/);
});

test("endpoint fiscal ausente ou não JSON mostra backend desatualizado", () => {
  assert.match(source, /FISCAL_ACCESS_ENDPOINT_UNAVAILABLE/);
  assert.match(
    source,
    /O backend ainda não disponibilizou o diagnóstico fiscal/,
  );
  assert.match(source, /accessResponse\.status === 404/);
  assert.match(source, /!contentType\.includes\("application\/json"\)/);
});

test("allowed true carrega status Focus somente após diagnóstico fiscal", () => {
  assert.match(source, /if \(!access\.allowed\)/);
  assert.match(source, /fetch\("\/api\/fiscal\/focus\/status"/);
  assert.ok(
    source.indexOf("/api/fiscal/access-status") <
      source.indexOf("/api/fiscal/focus/status"),
  );
});

test("frontend mostra FEATURE_ACCESS_QUERY_FAILED e diagnosticStage", () => {
  assert.match(source, /FEATURE_ACCESS_QUERY_FAILED/);
  assert.match(source, /Não foi possível consultar a assinatura da loja\./);
  assert.match(source, /Etapa: \{error\.diagnosticStage\}/);
  assert.match(source, /diagnosticStage: access\.diagnosticStage/);
});

test("frontend mostra AUTH_CONTEXT_FAILED sem dados internos", () => {
  assert.match(source, /AUTH_CONTEXT_FAILED/);
  assert.match(
    source,
    /Não foi possível validar sua sessão\. Faça login novamente\./,
  );
  assert.doesNotMatch(source, /stackTrace|sql|cookie:/i);
});

test("frontend não mostra erro de permissão quando /focus/status falha", () => {
  assert.match(source, /setStatusError/);
  assert.match(source, /FOCUS_STATUS_CHECK_FAILED/);
  assert.match(source, /!accessError && statusError/);
});

test("frontend mostra card de erro de status Focus separado", () => {
  assert.match(source, /Não foi possível carregar o status da Focus/);
  assert.match(
    source,
    /Seu acesso fiscal foi reconhecido,[\s\S]*carregar os dados da integração Focus\./,
  );
  assert.match(source, /focus_status_summary/);
});

test("botão tentar novamente chama status de novo", () => {
  assert.match(source, /Tentar novamente/);
  assert.match(source, /onRetry=\{\(\) => void loadStatus\(\)\}/);
});


const orderDetailDialogSource = readFileSync(
  new URL("../components/order-detail-dialog.tsx", import.meta.url),
  "utf8",
);
const orderDetailPageSource = readFileSync(
  new URL("./order-detail.tsx", import.meta.url),
  "utf8",
);
const fiscalNfcePanelSource = readFileSync(
  new URL("../components/fiscal-nfce-panel.tsx", import.meta.url),
  "utf8",
);

test("FiscalNfcePanel existe como componente reutilizável e é usado no dialog e na página do pedido", () => {
  assert.match(fiscalNfcePanelSource, /export function FiscalNfcePanel\(\{ order \}: \{ order: Order \}\)/);
  assert.match(orderDetailDialogSource, /import \{ FiscalNfcePanel \} from "@\/components\/fiscal-nfce-panel"/);
  assert.match(orderDetailDialogSource, /<FiscalNfcePanel order=\{order\} \/>/);
  assert.match(orderDetailPageSource, /import \{ FiscalNfcePanel \} from "@\/components\/fiscal-nfce-panel"/);
  assert.match(orderDetailPageSource, /<FiscalNfcePanel order=\{order\} \/>/);
  assert.match(fiscalNfcePanelSource, /Fiscal NFC-e/);
});

test("painel NFC-e usa access-status e não depende apenas do entitlement PRO", () => {
  assert.match(fiscalNfcePanelSource, /\/api\/fiscal\/access-status/);
  assert.match(fiscalNfcePanelSource, /accessStatus\?\.allowed === true/);
  assert.match(fiscalNfcePanelSource, /currentStore\?\.role === "max_control"/);
  assert.match(fiscalNfcePanelSource, /isPaidOrder\(order\)/);
  assert.match(fiscalNfcePanelSource, /\["cancelled", "canceled"\]/);
  assert.doesNotMatch(fiscalNfcePanelSource, /entitlement\?\.plan === "pro"/);
});

test("emissão exige modal de confirmação e cancelamento não chama API", () => {
  assert.match(fiscalNfcePanelSource, /Emitir NFC-e de teste\?/);
  assert.match(fiscalNfcePanelSource, /Esta emissão será feita em homologação/);
  assert.match(fiscalNfcePanelSource, /Cancelar/);
  assert.match(fiscalNfcePanelSource, /Emitir teste/);
  assert.match(fiscalNfcePanelSource, /onClick=\{\(\) => setConfirmOpen\(false\)\}/);
  assert.doesNotMatch(fiscalNfcePanelSource, /window\.alert|confirm\(/);
});

test("duplo clique não duplica POST e frontend nunca envia storeId", () => {
  assert.match(fiscalNfcePanelSource, /if \(issuing \|\| !canIssue\) return/);
  assert.match(fiscalNfcePanelSource, /disabled=\{issuing\}/);
  assert.match(fiscalNfcePanelSource, /method: "POST"/);
  assert.match(fiscalNfcePanelSource, /\/api\/fiscal\/nfce\/orders\/\$\{order\.id\}/);
  assert.match(fiscalNfcePanelSource, /\/api\/fiscal\/nfce\/homologation\/orders\/\$\{order\.id\}\/issue/);
  assert.match(fiscalNfcePanelSource, /\/api\/fiscal\/nfce\/orders\/\$\{order\.id\}\/refresh/);
  assert.doesNotMatch(fiscalNfcePanelSource, /storeId|currentStore\.id/);
});

test("status fiscal mostra draft, processando, autorizado, rejeitado e sync pending", () => {
  assert.match(fiscalNfcePanelSource, /Nenhuma NFC-e emitida para este pedido\./);
  assert.match(fiscalNfcePanelSource, /NFC-e reservada, mas ainda não enviada para a Focus\./);
  assert.match(fiscalNfcePanelSource, /Emitindo NFC-e de homologação/);
  assert.match(fiscalNfcePanelSource, /A Focus está processando a NFC-e\./);
  assert.match(fiscalNfcePanelSource, /NFC-e de homologação autorizada\./);
  assert.match(fiscalNfcePanelSource, /Chave de acesso/);
  assert.match(fiscalNfcePanelSource, /Protocolo/);
  assert.match(fiscalNfcePanelSource, /NFC-e rejeitada\./);
  assert.match(fiscalNfcePanelSource, /Código da rejeição/);
  assert.match(fiscalNfcePanelSource, /Não foi possível confirmar a situação da NFC-e na Focus\./);
});

test("draft e error permitem emitir; authorized e rejected não reemitem", () => {
  assert.match(fiscalNfcePanelSource, /const issuableStatuses = \["draft", "error"\] as const/);
  assert.match(fiscalNfcePanelSource, /!document \|\| issuableStatuses\.includes\(document\.status as "draft" \| "error"\)/);
  assert.match(fiscalNfcePanelSource, /status === "none" \|\| status === "draft" \|\| status === "error"/);
  assert.match(fiscalNfcePanelSource, /Emitir NFC-e de teste/);
  assert.match(fiscalNfcePanelSource, /status === "authorized" && document/);
  assert.match(fiscalNfcePanelSource, /status === "rejected" && document/);
});

test("processing e sync_pending mostram atualizar status sem emitir", () => {
  assert.match(fiscalNfcePanelSource, /status === "processing" \|\| status === "sync_pending"/);
  assert.match(fiscalNfcePanelSource, /Atualizar status/);
  assert.match(fiscalNfcePanelSource, /\/api\/fiscal\/nfce\/orders\/\$\{order\.id\}\/refresh/);
});

test("não existe rota de produção e erros fiscais são traduzidos sem segredos", () => {
  assert.match(fiscalNfcePanelSource, /next\.environment === "homologation"/);
  assert.doesNotMatch(fiscalNfcePanelSource, /production\/orders|\/api\/fiscal\/nfce\/production|\/api\/fiscal\/nfce\/orders\/\$\{order\.id\}\/issue/);
  assert.match(fiscalNfcePanelSource, /FISCAL_SETUP_NOT_READY: "A configuração fiscal ainda não está pronta para homologação\."/);
  assert.match(fiscalNfcePanelSource, /ORDER_NOT_PAID: "O pedido ainda não está pago\."/);
  assert.match(fiscalNfcePanelSource, /FOCUS_NFCE_UNAVAILABLE: "A Focus NFe está indisponível no momento\."/);
  assert.doesNotMatch(fiscalNfcePanelSource, /token Focus|CSC|certificado.*senha|payloadSnapshot|rawResponse|encrypted|stack|SQL/i);
});

test("painel NFC-e informa bloqueios esperados sem esconder por falta de Focus", () => {
  assert.match(fiscalNfcePanelSource, /\(order\.deliveryFee \?\? 0\) > 0/);
  assert.match(fiscalNfcePanelSource, /Este pedido possui taxa de entrega\. A emissão NFC-e será bloqueada até configurarmos o mapeamento fiscal da entrega\./);
  assert.match(fiscalNfcePanelSource, /order\.paymentTiming === "on_delivery"/);
  assert.match(fiscalNfcePanelSource, /Pedido marcado como pagar na entrega\. A emissão fiscal depende de pagamento aprovado no backend\./);
  assert.match(fiscalNfcePanelSource, /FISCAL_SETUP_NOT_READY: "A configuração fiscal ainda não está pronta para homologação\."/);
  assert.doesNotMatch(fiscalNfcePanelSource, /focus\/(status|company)|focusStatus|certificate|csc/i);
});

test("página /orders/:id renderiza o painel NFC-e após o resumo financeiro", () => {
  assert.ok(orderDetailPageSource.indexOf("Resumo financeiro") < orderDetailPageSource.indexOf("<FiscalNfcePanel order={order} />"));
  assert.ok(orderDetailPageSource.indexOf("<FiscalNfcePanel order={order} />") < orderDetailPageSource.lastIndexOf("Dados de Entrega"));
  assert.match(fiscalNfcePanelSource, /Fiscal NFC-e/);
});
