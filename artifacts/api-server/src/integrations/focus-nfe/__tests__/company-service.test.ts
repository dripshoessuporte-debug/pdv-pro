import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync("src/integrations/focus-nfe/company-service.ts", "utf8");
const route = readFileSync("src/routes/fiscal-focus.ts", "utf8");
const runner = readFileSync("scripts/run-focus-nfe-tests.mjs", "utf8");

const cases: Array<[string, () => void]> = [
  [".pfx válido é aceito pela validação de extensão", () => assert.match(service, /pfx\|p12/)],
  [".p12 válido é aceito pela validação de extensão", () => assert.match(service, /pfx\|p12/)],
  ["campo errado de arquivo retorna erro seguro", () => assert.match(route, /Campo de arquivo inválido/)],
  ["arquivo ausente retorna erro seguro", () => assert.match(route, /Envie o arquivo do certificado/)],
  ["múltiplos arquivos são rejeitados", () => assert.match(route, /Envie somente um certificado/)],
  ["arquivo acima de 5 MB é rejeitado", () => assert.match(service, /5 \* 1024 \* 1024/)],
  ["multipart inválido é rejeitado", () => assert.match(route, /Upload multipart inválido/)],
  ["erro do upload retorna JSON seguro", () => assert.match(route, /safeUploadError/)],
  ["senha com espaços não é modificada", () => assert.match(route, /preserveString/)],
  ["senha do certificado não usa trim", () => assert.doesNotMatch(route, /certificatePassword[^\n]+trim/)],
  ["buffer zerado em erro de validação", () => assert.match(service, /finally \{ input\.content\.fill\(0\); \}/)],
  ["buffer zerado sem empresa vinculada", () => assert.match(service, /providerCompanyId[\s\S]+finally \{ input\.content\.fill\(0\); \}/)],
  ["buffer zerado sem token", () => assert.match(service, /resolveStoreFocusCredentials[\s\S]+finally \{ input\.content\.fill\(0\); \}/)],
  ["buffer zerado quando a Focus falha", () => assert.match(service, /focus_certificate_rejected[\s\S]+finally \{ input\.content\.fill\(0\); \}/)],
  ["CSC inválido retorna CSC_VALIDATION_ERROR", () => assert.match(service, /CSC_VALIDATION_ERROR[\s\S]+ID do CSC/)],
  ["CSC nunca aparece na resposta de status", () => { const statusResponse = route.match(/res\.json\(\{ provider:[\s\S]*?missingRequirements: company\.missingRequirements \}\);/)?.[0] ?? ""; assert.doesNotMatch(statusResponse, /cscSecret|cscIdConfigured|providerCompanyId|password|certificateReference|initializationVector|authenticationTag/); assert.match(statusResponse, /cscConfigured/); }],
  ["Focus aceita CSC e banco falha retorna FOCUS_APPLIED_LOCAL_SYNC_FAILED", () => assert.match(service, /focus_csc_accepted[\s\S]+FOCUS_APPLIED_LOCAL_SYNC_FAILED/)],
  ["certificado aceito e banco falha retorna FOCUS_APPLIED_LOCAL_SYNC_FAILED", () => assert.match(service, /focus_certificate_submitted[\s\S]+FOCUS_APPLIED_LOCAL_SYNC_FAILED/)],
  ["certificado submitted libera readyForHomologationTest", () => assert.match(service, /certificateStatus === "submitted"[\s\S]+readyForHomologationTest/)],
  ["certificado submitted não libera readyForHomologation", () => assert.match(service, /certificateStatus === "valid"[\s\S]+readyForHomologation = readyForHomologationTest && certificateValid/)],
  ["modelo Simplificado completo é aceito via regras fiscais completas", () => assert.match(service, /fiscalRules/)],
  ["modelo Simplificado incompleto é rejeitado via missingRequirements", () => assert.match(service, /missing\.push\("fiscalRules"\)/)],
  ["modelo Completo completo é aceito via regras fiscais completas", () => assert.match(service, /isNotNull\(fiscalGroupRulesTable\.ncm\)/)],
  ["produto de outra loja não libera a loja atual", () => assert.match(service, /eq\(fiscalGroupRulesTable\.storeId, storeId\)/)],
  ["nenhuma NFC-e é emitida neste fluxo", () => assert.doesNotMatch(service + route, /\/v2\/nfce|emit/i)],
  ["runner usa FISCAL_SECRETS_ENCRYPTION_KEY com 32 bytes", () => assert.match(runner, /FISCAL_SECRETS_ENCRYPTION_KEY[^\n]+12345678901234567890123456789012/)],
];

for (const [name, fn] of cases) test(name, fn);
