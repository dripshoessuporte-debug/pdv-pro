import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSource = readFileSync(resolve("src/routes/fiscal-focus.ts"), "utf8");
const serviceSource = readFileSync(
  resolve("src/integrations/focus-nfe/company-service.ts"),
  "utf8",
);
const readinessSource = readFileSync(
  resolve("src/integrations/focus-nfe/readiness.ts"),
  "utf8",
);

test("/api/fiscal/focus/status não retorna 500 genérico quando resumo falha", () => {
  assert.match(routeSource, /\/fiscal\/focus\/status/);
  assert.match(routeSource, /try \{/);
  assert.match(
    routeSource,
    /res\.status\(503\)\.json\(focusStatusFailureBody\(environment\)\)/,
  );
  assert.doesNotMatch(routeSource, /res\.status\(500\).*focus\/status/s);
});

test("erro total retorna FOCUS_STATUS_CHECK_FAILED seguro e not_configured", () => {
  assert.match(routeSource, /FOCUS_STATUS_CHECK_FAILED/);
  assert.match(routeSource, /diagnosticStage: "focus_status_summary"/);
  assert.match(routeSource, /setupStatus: "not_configured"/);
  assert.match(
    routeSource,
    /missingRequirements: \["focus_status_unavailable"\]/,
  );
});

test("resposta e log seguros não expõem SQL, stack, token, CSC ou certificado", () => {
  assert.match(routeSource, /safeStatusMessage/);
  assert.match(
    routeSource,
    /sql\|select\|insert\|update\|delete\|token\|secret\|senha\|password\|certificate\|csc\|stack/i,
  );
  const failureBody = routeSource.slice(
    routeSource.indexOf("function focusStatusFailureBody"),
    routeSource.indexOf("function sendSetupError"),
  );
  assert.doesNotMatch(
    failureBody,
    /SQL|stack|token[A-Z]|cscSecret|certificateReference|password|senha/,
  );
});

test("falha na consulta de credenciais não derruba status inteiro", () => {
  assert.match(
    serviceSource,
    /credentialStatusStage = "credential_status_unavailable"/,
  );
  assert.match(
    serviceSource,
    /missingRequirements\.push\("credential_status_unavailable"\)/,
  );
});

test("falha no cálculo de regras fiscais não derruba status inteiro", () => {
  assert.match(
    serviceSource,
    /rulesStatusStage = "fiscal_rules_status_unavailable"/,
  );
  assert.match(serviceSource, /"fiscal_rules_status_unavailable"/);
});

test("modo complete vem de store_fiscal_presentation.mode", () => {
  assert.match(serviceSource, /storeFiscalPresentationTable\.mode/);
  assert.match(
    serviceSource,
    /getHomologationRuleMode\(presentation\) === "complete"/,
  );
  assert.match(readinessSource, /presentation\?\.mode === "complete"/);
});

test("modo simplified vem de store_fiscal_presentation.mode e ausência assume simplified", () => {
  assert.match(readinessSource, /: "simplified"/);
  assert.doesNotMatch(readinessSource, /itemizationMode/);
  assert.doesNotMatch(readinessSource, /emissionMode/);
});

test("diagnóstico debug protegido retorna apenas campos seguros", () => {
  assert.match(routeSource, /\/fiscal\/focus\/status\/debug/);
  assert.match(routeSource, /requireRole\("max_control"\)/);
  assert.match(routeSource, /requireStoreFeature\("fiscal"\)/);
  assert.match(routeSource, /hasSettings/);
  assert.match(routeSource, /hasStoreFiscalPresentation/);
  assert.match(routeSource, /detectedMode/);
  const debugBlock = routeSource.slice(
    routeSource.indexOf("/fiscal/focus/status/debug"),
    routeSource.indexOf("/fiscal/focus/company"),
  );
  assert.doesNotMatch(
    debugBlock,
    /token|cscSecret|certificateReference|payload|sql/i,
  );
});

test("nenhuma chamada real à Focus e nenhuma NFC-e é emitida no status", () => {
  const statusBlock = routeSource.slice(
    routeSource.indexOf('"/fiscal/focus/status"'),
    routeSource.indexOf('"/fiscal/focus/status/debug"'),
  );
  assert.match(statusBlock, /getFocusCompanySummary\(actor\.storeId\)/);
  assert.doesNotMatch(
    statusBlock,
    /new FocusNfeClient|NfceService|issueHomologation|FOCUS_NFCE_ENDPOINTS|\/v2\/nfce|client\.request/i,
  );
});
