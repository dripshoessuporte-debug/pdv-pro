import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedSecret = {
  encryptedValue: string;
  initializationVector: string;
  authenticationTag: string;
  keyVersion: string;
};

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const DEFAULT_KEY_VERSION = "v1";

export class FiscalSecretsError extends Error {
  constructor(message = "Segredo fiscal indisponível ou inválido.") {
    super(message);
    this.name = "FiscalSecretsError";
  }
}

function encryptionKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.FISCAL_SECRETS_ENCRYPTION_KEY;
  if (!raw) throw new FiscalSecretsError("Chave de criptografia fiscal não configurada.");
  const key = Buffer.from(raw, "base64");
  const fallback = Buffer.from(raw, "utf8");
  const resolved = key.length === 32 ? key : fallback;
  if (resolved.length !== 32) throw new FiscalSecretsError("Chave de criptografia fiscal inválida.");
  return resolved;
}

export function encryptSecret(secret: string, env: NodeJS.ProcessEnv = process.env): EncryptedSecret {
  if (!secret) throw new FiscalSecretsError("Segredo fiscal inválido.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKeyFromEnv(env), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    encryptedValue: encrypted.toString("base64"),
    initializationVector: iv.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
    keyVersion: DEFAULT_KEY_VERSION,
  };
}

export function decryptSecret(encrypted: EncryptedSecret, env: NodeJS.ProcessEnv = process.env): string {
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKeyFromEnv(env), Buffer.from(encrypted.initializationVector, "base64"));
    decipher.setAuthTag(Buffer.from(encrypted.authenticationTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.encryptedValue, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof FiscalSecretsError) throw error;
    throw new FiscalSecretsError("Não foi possível descriptografar o segredo fiscal.");
  }
}
