/**
 * Encrypts stored BYOK API keys at rest with AES-256-GCM.
 * The ciphertext is bound to its owning row via AAD, so a key can't be
 * copied to another user/provider and still decrypt.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@OpenDiagram/env/server";

const ALGORITHM = "aes-256-gcm";

export interface SecretContext {
  userId: string;
  providerId: string;
  provider: string;
}

export class ByokEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ByokEncryptionError";
  }
}

function encryptionKey(): Buffer {
  if (!env.BYOK_ENCRYPTION_KEY) {
    throw new ByokEncryptionError(
      "BYOK is not configured. Set BYOK_ENCRYPTION_KEY (openssl rand -base64 32).",
    );
  }
  const key = Buffer.from(env.BYOK_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new ByokEncryptionError("BYOK_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

/** True when the server can encrypt/decrypt BYOK keys (key present and valid). */
export function canEncryptByokKeys(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

function aad(context: SecretContext): Buffer {
  return Buffer.from(`${context.userId}\0${context.providerId}\0${context.provider}`, "utf8");
}

export function encryptSecret(plaintext: string, context: SecretContext): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, context: SecretContext): string {
  const [iv, tag, ciphertext] = payload.split(".");
  if (!iv || !tag || !ciphertext) {
    throw new ByokEncryptionError("Stored API key is malformed.");
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(aad(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last 4 chars of a key, for showing "••••abcd" in the UI. */
export function keyLast4(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}
