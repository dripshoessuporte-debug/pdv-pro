import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const routeSource = readFileSync(resolve("src/routes/fiscal-focus.ts"), "utf8");
const cryptoSource = readFileSync(resolve("src/lib/fiscal-secrets/crypto.ts"), "utf8");
const frontendSource = readFileSync(resolve("../restaurant-pdv/src/pages/fiscal-focus.tsx"), "utf8");
const preflightBlock = routeSource.slice(routeSource.indexOf("async function buildSystemPreflight"), routeSource.indexOf("router.post(\n  \"/fiscal/production/release\""));

test("system preflight endpoint is secure and validates fiscal crypto readiness", () => {
  assert.match(routeSource, /"\/fiscal\/system-preflight"/);
  assert.match(routeSource, /requireRole\("max_control"\)/);
  assert.match(routeSource, /requireStoreFeature\("fiscal"\)/);
  assert.match(routeSource, /resolveCurrentActor\(req\)/);
  assert.doesNotMatch(routeSource, /req\.body\.storeId|req\.query\.storeId/);
  assert.match(routeSource, /FISCAL_SECRET_KEY_READY/);
  assert.match(routeSource, /FISCAL_SECRET_ROUNDTRIP/);
  assert.match(routeSource, /encryptSecret\(fake\)/);
  assert.match(routeSource, /decryptSecret\(encrypted\)/);
  assert.match(routeSource, /DATABASE_URL_CONFIGURED/);
  assert.match(routeSource, /FISCAL_MIGRATIONS_APPLIED/);
});

test("system preflight checks required fiscal tables and does not expose secrets", () => {
  for (const table of ["store_fiscal_settings", "fiscal_provider_credentials", "fiscal_documents", "fiscal_inutilizations", "fiscal_groups", "fiscal_group_rules"]) {
    assert.match(routeSource, new RegExp(table));
  }
  assert.match(routeSource, /FOCUS_BASE_CONFIG_RESOLVED/);
  assert.doesNotMatch(preflightBlock, /encryptedValue:|initializationVector:|authenticationTag:|cscSecret:|certificatePassword:|token: baseToken|DATABASE_URL: process\.env/);
});

test("go-live checklist treats store credential as primary and global token as diagnostic", () => {
  assert.match(routeSource, /const focusReady = Boolean\(focus\.companyLinked && focus\.homologationCredentialConfigured\)/);
  assert.match(routeSource, /FOCUS_GLOBAL_HOMOLOGATION_TOKEN_DIAGNOSTIC/);
  assert.match(routeSource, /não bloqueia loja com credencial própria/);
  assert.doesNotMatch(routeSource, /const focusReady = Boolean\(baseToken\.token/);
});

test("friendly fiscal encryption key errors are returned by setup error mapping", () => {
  assert.match(cryptoSource, /Chave de criptografia fiscal não configurada no servidor\. Configure FISCAL_SECRETS_ENCRYPTION_KEY no Railway\./);
  assert.match(cryptoSource, /Chave de criptografia fiscal inválida\. Ela deve ter 32 bytes ou base64 válido de 32 bytes\./);
});

test("production release endpoint blocks unsafe release and audits success", () => {
  assert.match(routeSource, /"\/fiscal\/production\/release"/);
  assert.match(routeSource, /body\.confirmation !== "LIBERAR PRODUCAO FISCAL"/);
  assert.match(routeSource, /focus\.productionCredentialConfigured/);
  assert.match(routeSource, /homologation.*authorized/s);
  assert.match(routeSource, /\["rejected", "error"\]\.includes\(lastDocument\.status\)/);
  assert.match(routeSource, /setupStatus: "production"/);
  assert.match(routeSource, /fiscal_production_released/);
  assert.match(routeSource, /Produção fiscal liberada com segurança para esta loja\./);
  assert.match(routeSource, /Produção fiscal ainda não pode ser liberada/);
});

test("Fiscal Focus UI exposes controlled preflight and production release controls", () => {
  assert.match(frontendSource, /Preflight Técnico Fiscal/);
  assert.match(frontendSource, /Verificar sistema fiscal/);
  assert.match(frontendSource, /\/api\/fiscal\/system-preflight/);
  assert.match(frontendSource, /Liberar produção fiscal/);
  assert.match(frontendSource, /LIBERAR PRODUCAO FISCAL/);
  assert.match(frontendSource, /A partir desta liberação, NFC-e em produção poderá gerar documento fiscal real/);
});
