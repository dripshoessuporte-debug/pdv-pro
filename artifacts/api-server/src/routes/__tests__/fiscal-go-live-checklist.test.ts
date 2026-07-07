import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSource = readFileSync(resolve("src/routes/fiscal-focus.ts"), "utf8");
const indexSource = readFileSync(resolve("src/routes/index.ts"), "utf8");
const frontendSource = readFileSync(resolve("../restaurant-pdv/src/pages/fiscal-focus.tsx"), "utf8");
const routeBlock = routeSource.slice(
  routeSource.indexOf('"/fiscal/go-live-checklist"'),
  routeSource.indexOf('"/fiscal/focus/readiness"'),
);

test("endpoint Go-Live Fiscal é protegido por autenticação, max_control e feature fiscal", () => {
  assert.match(indexSource, /router\.use\(attachCurrentActor\)/);
  assert.match(routeBlock, /requireRole\("max_control"\)/);
  assert.match(routeBlock, /requireStoreFeature\("fiscal"\)/);
});

test("endpoint usa actor.storeId e não aceita storeId do frontend", () => {
  assert.match(routeBlock, /const actor = await resolveCurrentActor\(req\)/);
  assert.match(routeBlock, /storeId: actor\.storeId/);
  assert.match(routeBlock, /eq\(fiscalDocumentsTable\.storeId, actor\.storeId\)/);
  assert.doesNotMatch(routeBlock, /req\.query\.storeId|req\.body\?\.storeId|body\.storeId|query\.storeId/);
  assert.match(routeBlock, /STORE_SCOPE_ENFORCED/);
});

test("endpoint não retorna token Focus, CSC, certificado, senha ou payload fiscal completo", () => {
  assert.match(routeBlock, /SECRETS_NOT_EXPOSED/);
  assert.doesNotMatch(routeBlock, /homologationToken|productionToken|cscSecret|certificatePassword|encryptedValue|initializationVector|authenticationTag|payloadFiscal|fiscalPayload|rawResponse/);
  assert.doesNotMatch(routeBlock, /res\.json\([\s\S]*token[A-Z]|res\.json\([\s\S]*certificateReference|res\.json\([\s\S]*password/i);
});

test("endpoint retorna warning quando não há documento homologado e ok quando há autorizado", () => {
  assert.match(routeBlock, /HOMOLOGATION_AUTHORIZED_DOCUMENT_EXISTS/);
  assert.match(routeBlock, /eq\(fiscalDocumentsTable\.environment, "homologation"\)/);
  assert.match(routeBlock, /eq\(fiscalDocumentsTable\.status, "authorized"\)/);
  assert.match(routeBlock, /homologationAuthorized \? "ok" : "warning"/);
  assert.match(routeBlock, /Validação automática indisponível; execute teste manual\./);
});

test("endpoint declara readiness de Multisabor, taxa, pagamento externo, cancelamento e inutilização", () => {
  for (const code of [
    "SIMPLE_ORDER_PAYLOAD_READY",
    "MULTISABOR_PAYLOAD_READY",
    "DELIVERY_FEE_PAYLOAD_READY",
    "EXTERNAL_PAYMENT_PAYLOAD_READY",
    "CANCELLATION_AVAILABLE",
    "INUTILIZATION_AVAILABLE",
  ]) assert.match(routeBlock, new RegExp(code));
});

test("endpoint deixa produção bloqueada com segurança quando não pronta", () => {
  assert.match(routeBlock, /PRODUCTION_READY_OR_BLOCKED_SAFELY/);
  assert.match(routeBlock, /productionReady \? "ok" : "blocked"/);
  assert.match(routeBlock, /readyForProduction: productionReady/);
});

test("frontend renderiza bloco Go-Live Fiscal sem substituir o checklist fiscal atual", () => {
  assert.match(frontendSource, /GoLiveFiscalCard/);
  assert.match(frontendSource, /\/api\/fiscal\/go-live-checklist/);
  assert.match(frontendSource, /Go-Live Fiscal/);
  assert.match(frontendSource, /Pronto para homologação controlada/);
  assert.match(frontendSource, /Pronto para produção/);
  assert.match(frontendSource, /Atualizar checklist/);
  assert.match(frontendSource, /Fiscal PRO — Checklist de Implantação/);
  assert.match(frontendSource, /Checklist de homologação/);
});
