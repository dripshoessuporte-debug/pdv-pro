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
  assert.doesNotMatch(source, /\/api\/.*nfce|emitir.*fetch/i);
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


const orderDetailSource = readFileSync(
  new URL("../components/order-detail-dialog.tsx", import.meta.url),
  "utf8",
);

test("pedido pago max_control PRO mostra emissão NFC-e de teste somente homologação", () => {
  assert.match(orderDetailSource, /Emitir NFC-e de teste/);
  assert.match(orderDetailSource, /currentStore\?\.role === "max_control"/);
  assert.match(orderDetailSource, /entitlement\?\.plan === "pro"/);
  assert.match(orderDetailSource, /isPaidOrder\(order\)/);
  assert.match(orderDetailSource, /\["cancelled", "canceled"\]/);
  assert.match(orderDetailSource, /next\.environment === "homologation"/);
  assert.match(orderDetailSource, /\/api\/fiscal\/nfce\/homologation\/orders\/\$\{order\.id\}\/issue/);
  assert.doesNotMatch(orderDetailSource, /production\/orders|\/api\/fiscal\/nfce\/production/);
});

test("emissão exige modal de confirmação e cancelamento não chama API", () => {
  assert.match(orderDetailSource, /Emitir NFC-e de teste\?/);
  assert.match(orderDetailSource, /Esta emissão será feita em homologação/);
  assert.match(orderDetailSource, /Cancelar/);
  assert.match(orderDetailSource, /Emitir teste/);
  assert.match(orderDetailSource, /onClick=\{\(\) => setConfirmOpen\(false\)\}/);
  assert.doesNotMatch(orderDetailSource, /window\.alert|confirm\(/);
});

test("duplo clique não duplica POST e frontend nunca envia storeId", () => {
  assert.match(orderDetailSource, /if \(issuing \|\| !canIssue\) return/);
  assert.match(orderDetailSource, /disabled=\{issuing\}/);
  assert.match(orderDetailSource, /method: "POST"/);
  assert.doesNotMatch(orderDetailSource, /storeId|currentStore\.id/);
});

test("status fiscal mostra sem documento, processando, autorizado, rejeitado e sync pending", () => {
  assert.match(orderDetailSource, /Nenhuma NFC-e emitida para este pedido\./);
  assert.match(orderDetailSource, /Emitindo NFC-e de homologação/);
  assert.match(orderDetailSource, /A Focus está processando a NFC-e\./);
  assert.match(orderDetailSource, /NFC-e de homologação autorizada\./);
  assert.match(orderDetailSource, /Chave de acesso/);
  assert.match(orderDetailSource, /Protocolo/);
  assert.match(orderDetailSource, /NFC-e rejeitada\./);
  assert.match(orderDetailSource, /Código da rejeição/);
  assert.match(orderDetailSource, /Não foi possível confirmar a situação da NFC-e na Focus\./);
});

test("atualizar status chama refresh e erros fiscais são traduzidos sem segredos", () => {
  assert.match(orderDetailSource, /Atualizar status/);
  assert.match(orderDetailSource, /\/api\/fiscal\/nfce\/orders\/\$\{order\.id\}\/refresh/);
  assert.match(orderDetailSource, /FISCAL_SETUP_NOT_READY: "A configuração fiscal ainda não está pronta para homologação\."/);
  assert.match(orderDetailSource, /ORDER_NOT_PAID: "O pedido ainda não está pago\."/);
  assert.match(orderDetailSource, /FOCUS_NFCE_UNAVAILABLE: "A Focus NFe está indisponível no momento\."/);
  assert.doesNotMatch(orderDetailSource, /token Focus|CSC|certificado.*senha|payloadSnapshot|rawResponse|encrypted|stack|SQL/i);
});
