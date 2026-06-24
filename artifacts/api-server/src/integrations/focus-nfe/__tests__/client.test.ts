import test from "node:test";
import assert from "node:assert/strict";
import { FocusNfeClient, FocusNfeError, focusNfeAuthForTests, type FocusNfeStoreContext } from "../index";

const token = "focus_secret_token_123";
const baseConfig = {
  timeoutMs: 50,
  baseUrls: {
    homologation: "https://homologacao.focusnfe.com.br",
    production: "https://api.focusnfe.com.br",
  },
};

function context(environment: "homologation" | "production" = "homologation"): FocusNfeStoreContext {
  return { storeId: 42, environment, credentials: { token, tokenReference: "TEST_TOKEN" }, providerCompanyId: "empresa-42" };
}

test("seleciona base URL de homologação e produção", async () => {
  const urls: string[] = [];
  const client = new FocusNfeClient({ config: baseConfig, fetchImpl: async (url) => { urls.push(String(url)); return new Response(JSON.stringify({ ok: true }), { status: 200 }); } });
  await client.request(context("homologation"), { method: "GET", path: "/v2/nfce/ref-1" });
  await client.request(context("production"), { method: "GET", path: "/v2/nfce/ref-2" });
  assert.equal(urls[0], "https://homologacao.focusnfe.com.br/v2/nfce/ref-1");
  assert.equal(urls[1], "https://api.focusnfe.com.br/v2/nfce/ref-2");
});

test("monta autenticação Basic Auth com token como usuário e senha em branco", async () => {
  let authorization = "";
  const client = new FocusNfeClient({ config: baseConfig, fetchImpl: async (_url, init) => { authorization = String((init?.headers as Record<string, string>).Authorization); return new Response("{}", { status: 200 }); } });
  await client.request(context(), { method: "GET", path: "/v2/nfce/ref" });
  assert.equal(authorization, focusNfeAuthForTests.buildBasicAuthHeader(token));
  assert.equal(Buffer.from(authorization.replace("Basic ", ""), "base64").toString("utf8"), `${token}:`);
});

test("normaliza timeout", async () => {
  const client = new FocusNfeClient({ config: { ...baseConfig, timeoutMs: 5 }, fetchImpl: async (_url, init) => new Promise<Response>((resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))); setTimeout(() => resolve(new Response("{}", { status: 200 })), 50); }) });
  await assert.rejects(() => client.request(context(), { method: "GET", path: "/v2/nfce/ref" }), (error) => error instanceof FocusNfeError && error.kind === "timeout");
});

test("normaliza erro 401 sem vazar token", async () => {
  const client = new FocusNfeClient({ config: baseConfig, fetchImpl: async () => new Response(JSON.stringify({ codigo: "nao_autenticado", mensagem: `token ${token} recusado` }), { status: 401 }) });
  await assert.rejects(() => client.request(context(), { method: "GET", path: "/v2/nfce/ref" }), (error) => {
    assert.ok(error instanceof FocusNfeError);
    assert.equal(error.kind, "authentication");
    assert.equal(error.status, 401);
    assert.equal(error.providerCode, "nao_autenticado");
    assert.ok(!error.message.includes(token));
    assert.ok(!JSON.stringify(error.safeDetails).includes(token));
    return true;
  });
});

test("normaliza erro de validação", async () => {
  const client = new FocusNfeClient({ config: baseConfig, fetchImpl: async () => new Response(JSON.stringify({ codigo: "requisicao_invalida", mensagem: "Campo obrigatório", erros: [{ campo: "ref" }] }), { status: 400 }) });
  await assert.rejects(() => client.request(context(), { method: "POST", path: "/v2/nfce", body: {}, idempotencyReference: "pedido-1" }), (error) => error instanceof FocusNfeError && error.kind === "validation" && error.status === 400 && error.providerCode === "requisicao_invalida");
});

test("normaliza falha de rede", async () => {
  const client = new FocusNfeClient({ config: baseConfig, fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(() => client.request(context(), { method: "GET", path: "/v2/nfce/ref" }), (error) => error instanceof FocusNfeError && error.kind === "communication");
});

test("remove segredos dos detalhes seguros", async () => {
  const client = new FocusNfeClient({ config: baseConfig, fetchImpl: async () => new Response(JSON.stringify({ codigo: "x", mensagem: "erro", token, Authorization: token, cscSecret: token, certificado: token }), { status: 422 }) });
  await assert.rejects(() => client.request(context(), { method: "GET", path: "/v2/nfce/ref" }), (error) => {
    assert.ok(error instanceof FocusNfeError);
    assert.ok(!JSON.stringify(error.safeDetails).includes(token));
    return true;
  });
});

test("POST não é repetido automaticamente", async () => {
  let calls = 0;
  const client = new FocusNfeClient({ config: baseConfig, fetchImpl: async () => { calls += 1; throw new TypeError("temporary network failure"); } });
  await assert.rejects(() => client.request(context(), { method: "POST", path: "/v2/nfce", body: { teste: true }, idempotencyReference: "pedido-123" }));
  assert.equal(calls, 1);
});
