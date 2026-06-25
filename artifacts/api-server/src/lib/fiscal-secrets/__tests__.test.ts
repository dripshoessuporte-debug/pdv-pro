import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, FiscalSecretsError } from "./crypto";

const key = "12345678901234567890123456789012";

test("encryptSecret/decryptSecret roundtrip sem expor segredo", () => {
  const encrypted = encryptSecret("token-super-secreto", { FISCAL_SECRETS_ENCRYPTION_KEY: key } as NodeJS.ProcessEnv);
  assert.equal(decryptSecret(encrypted, { FISCAL_SECRETS_ENCRYPTION_KEY: key } as NodeJS.ProcessEnv), "token-super-secreto");
  assert.notEqual(encrypted.encryptedValue, "token-super-secreto");
});

test("textos iguais geram criptogramas diferentes por IV", () => {
  const a = encryptSecret("mesmo-token", { FISCAL_SECRETS_ENCRYPTION_KEY: key } as NodeJS.ProcessEnv);
  const b = encryptSecret("mesmo-token", { FISCAL_SECRETS_ENCRYPTION_KEY: key } as NodeJS.ProcessEnv);
  assert.notEqual(a.initializationVector, b.initializationVector);
  assert.notEqual(a.encryptedValue, b.encryptedValue);
});

test("chave errada não descriptografa e erro não contém token", () => {
  const encrypted = encryptSecret("token-que-nao-pode-vazar", { FISCAL_SECRETS_ENCRYPTION_KEY: key } as NodeJS.ProcessEnv);
  assert.throws(
    () => decryptSecret(encrypted, { FISCAL_SECRETS_ENCRYPTION_KEY: "abcdefghijklmnopqrstuvxyz123456" } as NodeJS.ProcessEnv),
    (error) => error instanceof FiscalSecretsError && !String(error.message).includes("token-que-nao-pode-vazar"),
  );
});

test("chave ausente falha com mensagem segura", () => {
  assert.throws(() => encryptSecret("token", {} as NodeJS.ProcessEnv), FiscalSecretsError);
});
