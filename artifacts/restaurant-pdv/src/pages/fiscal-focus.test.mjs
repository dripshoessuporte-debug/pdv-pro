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
  assert.match(source, /Recurso exclusivo do Gestor Max PRO/);
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
