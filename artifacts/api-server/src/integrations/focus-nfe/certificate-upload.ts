import type { Request } from "express";
import { CERTIFICATE_VALIDATION_ERROR, FocusSetupError } from "./setup-errors";

export type ParsedCertificateUpload = { filename: string; content: Buffer; password: string; multipartBody?: Buffer };
const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
const MAX_PASSWORD_CHARS = 500;

function fail(message: string): never { throw new FocusSetupError(CERTIFICATE_VALIDATION_ERROR, message); }

export async function assertNativeMultipartFormDataSupport(): Promise<void> {
  const form = new FormData();
  form.set("certificatePassword", "x");
  form.set("certificate", new Blob([Buffer.from("abc")]), "test.pfx");
  const res = new Response(form);
  const contentType = res.headers.get("content-type");
  const body = Buffer.from(await res.arrayBuffer());
  const parsed = await new Request("http://local/upload", { method: "POST", headers: { "content-type": contentType ?? "" }, body }).formData();
  if (parsed.get("certificatePassword") !== "x" || !(parsed.get("certificate") instanceof File)) fail("Runtime Node sem suporte a multipart nativo.");
}

export async function parseCertificateMultipartRequest(req: Request): Promise<ParsedCertificateUpload> {
  const type = String(req.headers["content-type"] ?? "");
  if (!type.toLowerCase().startsWith("multipart/form-data") || !/boundary=/i.test(type)) fail("Envie multipart/form-data com o certificado A1.");
  if (!Buffer.isBuffer(req.body)) fail("Upload multipart inválido.");
  const multipartBody = req.body;
  let fileBuffer: Buffer | undefined;
  try {
    const request = new Request("http://local/fiscal/focus/certificate", { method: "POST", headers: { "content-type": type }, body: multipartBody });
    const form = await request.formData();
    let filename = "";
    let fileCount = 0;
    let wrongFileField = false;
    for (const [name, value] of form.entries()) {
      if (value instanceof File) {
        if (name !== "certificate") wrongFileField = true;
        fileCount += 1;
        if (name === "certificate") {
          filename = value.name;
          fileBuffer = Buffer.from(await value.arrayBuffer());
        }
      }
    }
    if (wrongFileField) fail("Campo de arquivo inválido.");
    if (fileCount === 0) fail("Envie o arquivo do certificado.");
    if (fileCount > 1) fail("Envie somente um certificado.");
    if (!fileBuffer) fail("Envie o arquivo do certificado.");
    const passwordValue = form.get("certificatePassword");
    if (typeof passwordValue !== "string" || passwordValue.length === 0) fail("Informe a senha do certificado.");
    if (passwordValue.length > MAX_PASSWORD_CHARS) fail("A senha do certificado deve ter no máximo 500 caracteres.");
    if (!/\.(pfx|p12)$/i.test(filename)) fail("Envie um certificado A1 .pfx ou .p12.");
    if (fileBuffer.length === 0) fail("O certificado enviado está vazio.");
    if (fileBuffer.length > MAX_CERTIFICATE_BYTES) fail("O certificado deve ter no máximo 5 MB.");
    return { filename, content: fileBuffer, password: passwordValue, multipartBody };
  } catch (error) {
    if (fileBuffer) fileBuffer.fill(0);
    if (error instanceof FocusSetupError) throw error;
    fail("Upload multipart inválido.");
  }
}
