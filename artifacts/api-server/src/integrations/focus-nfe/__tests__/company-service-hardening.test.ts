import test from "node:test";
import assert from "node:assert/strict";
import { FocusNfeError } from "../errors";
import { FocusSetupError, uploadFocusCertificate } from "../company-service";

test("FocusSetupError exposes safe codes without leaking secrets", () => {
  const error = new FocusSetupError("CERTIFICATE_VALIDATION_ERROR", "Informe a senha do certificado.");
  assert.equal(error.code, "CERTIFICATE_VALIDATION_ERROR");
  assert.ok(!error.message.includes("super-secret"));
});

test("FocusNfeError keeps normalized external error kind", () => {
  const error = new FocusNfeError({ kind: "timeout", message: "Tempo esgotado" });
  assert.equal(error.kind, "timeout");
});

test("certificate buffer is zeroed on validation error", async () => {
  const content = Buffer.from("secret-cert");
  await assert.rejects(() => uploadFocusCertificate({ storeId: 1, filename: "cert.txt", content, password: "pw" }), /\.pfx ou \.p12/);
  assert.deepEqual([...content], new Array(content.length).fill(0));
});
