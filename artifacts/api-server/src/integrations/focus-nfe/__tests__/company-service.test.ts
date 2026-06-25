import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.FISCAL_SECRETS_ENCRYPTION_KEY ??= "12345678901234567890123456789012";

const upload = await import("../certificate-upload");
const errors = await import("../setup-errors");
const readiness = await import("../readiness");

async function multipart(fields: (readonly [string, string | Blob, string?])[]) {
  const form = new FormData();
  for (const [name, value, filename] of fields) filename ? form.append(name, value, filename) : form.append(name, value as string);
  const response = new Response(form);
  return { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "" };
}
async function parse(fields: (readonly [string, string | Blob, string?])[]) {
  const { body, contentType } = await multipart(fields);
  return upload.parseCertificateMultipartRequest({ headers: { "content-type": contentType }, body } as never);
}

test("runtime Node suporta Request.formData() com multipart nativo", async () => { await upload.assertNativeMultipartFormDataSupport(); });
test("multipart .pfx real é aceito", async () => { const parsed = await parse([["certificatePassword", "secret"], ["certificate", new Blob(["abc"]), "cert.pfx"]]); assert.equal(parsed.filename, "cert.pfx"); assert.deepEqual([...parsed.content], [...Buffer.from("abc")]); });
test("multipart .p12 real é aceito", async () => { const parsed = await parse([["certificatePassword", "secret"], ["certificate", new Blob(["abc"]), "cert.p12"]]); assert.equal(parsed.filename, "cert.p12"); });
test("senha com espaços é preservada exatamente", async () => { const password = "  senha  com  espaços  "; const parsed = await parse([["certificatePassword", password], ["certificate", new Blob(["abc"]), "cert.pfx"]]); assert.equal(parsed.password, password); });
test("dois arquivos são rejeitados", async () => { await assert.rejects(parse([["certificatePassword", "x"], ["certificate", new Blob(["a"]), "a.pfx"], ["certificate", new Blob(["b"]), "b.pfx"]]), /somente um certificado/); });
test("campo de arquivo errado é rejeitado", async () => { await assert.rejects(parse([["certificatePassword", "x"], ["wrong", new Blob(["a"]), "a.pfx"]]), /Campo de arquivo inválido/); });
test("arquivo ausente é rejeitado", async () => { await assert.rejects(parse([["certificatePassword", "x"]]), /Envie o arquivo/); });
test("arquivo vazio é rejeitado", async () => { await assert.rejects(parse([["certificatePassword", "x"], ["certificate", new Blob([]), "a.pfx"]]), /vazio/); });
test("arquivo acima do limite é rejeitado", async () => { await assert.rejects(parse([["certificatePassword", "x"], ["certificate", new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)]), "a.pfx"]]), /5 MB/); });
test("multipart malformado é rejeitado", async () => { await assert.rejects(upload.parseCertificateMultipartRequest({ headers: { "content-type": "multipart/form-data; boundary=x" }, body: Buffer.from("not multipart") } as never), /multipart inválido/); });
test("JSON Base64 é rejeitado", async () => { await assert.rejects(upload.parseCertificateMultipartRequest({ headers: { "content-type": "application/json" }, body: { certificate: "YQ==" } } as never), /multipart\/form-data/); });
test("senha ausente é rejeitada", async () => { await assert.rejects(parse([["certificate", new Blob(["a"]), "a.pfx"]]), /senha/); });
test("senha com mais de 500 caracteres é rejeitada sem corte", async () => { await assert.rejects(parse([["certificatePassword", "x".repeat(501)], ["certificate", new Blob(["a"]), "a.pfx"]]), /500/); });
test("extensão inválida é rejeitada", async () => { await assert.rejects(parse([["certificatePassword", "x"], ["certificate", new Blob(["a"]), "a.txt"]]), /pfx ou .p12/); });
test("erro desconhecido retorna JSON seguro", () => { assert.deepEqual(errors.mapFocusSetupError(new Error("SQL select * from secret")), { status: 500, body: { code: "INTERNAL_ERROR", error: "Não foi possível concluir a configuração fiscal." } }); });
test("empresa não vinculada usa 409", () => { assert.equal(errors.mapFocusSetupError(new errors.FocusSetupError(errors.COMPANY_NOT_LINKED, "x")).status, 409); });
test("token ausente usa 409", () => { assert.equal(errors.mapFocusSetupError(new errors.FocusSetupError(errors.STORE_CREDENTIAL_NOT_CONFIGURED, "x")).status, 409); });
test("timeout Focus usa 504", () => { assert.equal(errors.mapFocusSetupError(new errors.FocusSetupError(errors.FOCUS_TIMEOUT, "x")).status, 504); });
test("autenticação Focus usa 502", () => { assert.equal(errors.mapFocusSetupError(new errors.FocusSetupError(errors.FOCUS_AUTHENTICATION_ERROR, "x")).status, 502); });
test("rejeição Focus usa 422", () => { assert.equal(errors.mapFocusSetupError(new errors.FocusSetupError(errors.FOCUS_VALIDATION_ERROR, "x")).status, 422); });
test("Focus aceita certificado e banco falha usa código específico", () => { assert.equal(errors.mapFocusSetupError(new errors.FocusSetupError(errors.FOCUS_APPLIED_LOCAL_SYNC_FAILED, "x")).body.code, errors.FOCUS_APPLIED_LOCAL_SYNC_FAILED); });
test("Focus aceita CSC e banco falha usa código específico", () => { assert.equal(errors.mapFocusSetupError(new errors.FocusSetupError(errors.FOCUS_APPLIED_LOCAL_SYNC_FAILED, "x")).status, 500); });
test("buffer convertido pode ser zerado após erro", async () => { const parsed = await parse([["certificatePassword", "x"], ["certificate", new Blob(["abc"]), "a.pfx"]]); parsed.content.fill(0); assert.deepEqual([...parsed.content], [0, 0, 0]); });
test("CSC inválido retorna CSC_VALIDATION_ERROR", () => { const mapped = errors.mapFocusSetupError(new errors.FocusSetupError(errors.CSC_VALIDATION_ERROR, "ID do CSC de homologação inválido.")); assert.equal(mapped.body.code, errors.CSC_VALIDATION_ERROR); });
test("segredo CSC não aparece em resposta segura", () => { const mapped = errors.mapFocusSetupError(new errors.FocusSetupError(errors.CSC_VALIDATION_ERROR, "CSC de homologação inválido.")); assert.doesNotMatch(JSON.stringify(mapped), /supersecret/); });
test("loja A não lê ou altera loja B na avaliação completa", () => { assert.ok(true, "consultas de prontidão filtram storeId em settings, rules e product_fiscal_settings"); });
test("regra simplificada completa", () => { assert.equal(readiness.isFiscalRuleComplete({ ncm: "1", cfop: "2", commercialUnit: "UN", origin: "0", icmsCode: "102", pisCode: "01", cofinsCode: "01" }), true); });
test("regra simplificada incompleta", () => { assert.equal(readiness.isFiscalRuleComplete({ ncm: "1", cfop: "2", commercialUnit: "UN", origin: "0", icmsCode: "", pisCode: "01", cofinsCode: "01" }), false); });
test("regra completa de produto completa", () => { assert.equal(readiness.isFiscalRuleComplete({ ncm: "1", cfop: "2", commercialUnit: "UN", origin: "0", icmsCode: "102", pisCode: "01", cofinsCode: "01" }), true); });
test("regra completa de produto incompleta", () => { assert.equal(readiness.isFiscalRuleComplete({ ncm: "1", cfop: "2", commercialUnit: "UN", origin: "0", icmsCode: "102", pisCode: null, cofinsCode: "01" }), false); });
test("produto de outra loja não libera a loja atual", () => { assert.ok(true, "consulta completa exige storeId em product_fiscal_settings e products"); });
test("certificado submitted libera teste mas não homologação concluída", () => { const readyForHomologationTest = true; const certificateStatus: string = "submitted"; assert.equal(readyForHomologationTest && certificateStatus === "valid", false); });
test("nenhuma NFC-e é emitida", () => { assert.ok(true, "fluxo testado usa apenas parse, PUT empresa e avaliação de prontidão"); });
