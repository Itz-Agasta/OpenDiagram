/**
 * Encrypts stored BYOK credentials with a versioned AES-GCM envelope.
 * New secrets are bound to their user/provider row; legacy payloads remain readable.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@OpenDiagram/env/server";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "v1";
const LEGACY_KEY_ID = "primary";

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

function decodeKey(encoded: string, keyId: string): Buffer {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new ByokEncryptionError(`BYOK encryption key "${keyId}" must encode exactly 32 bytes.`);
  }
  return key;
}

function loadKeyring(): Map<string, Buffer> {
  const keys = new Map<string, Buffer>();
  for (const entry of env.BYOK_ENCRYPTION_KEYS?.split(",") ?? []) {
    const separator = entry.indexOf("=");
    const keyId = entry.slice(0, separator).trim();
    const encoded = entry.slice(separator + 1).trim();
    if (separator < 1 || !/^[a-zA-Z0-9_-]+$/.test(keyId) || !encoded) {
      throw new ByokEncryptionError(
        "BYOK_ENCRYPTION_KEYS must use comma-separated keyId=base64Key entries.",
      );
    }
    keys.set(keyId, decodeKey(encoded, keyId));
  }

  if (env.BYOK_ENCRYPTION_KEY) {
    const keyId = env.BYOK_ENCRYPTION_KEY_ID ?? LEGACY_KEY_ID;
    const decoded = decodeKey(env.BYOK_ENCRYPTION_KEY, keyId);
    if (!keys.has(keyId)) keys.set(keyId, decoded);
    if (!keys.has(LEGACY_KEY_ID)) keys.set(LEGACY_KEY_ID, decoded);
  }
  return keys;
}

function activeKey(): { id: string; key: Buffer } {
  const keys = loadKeyring();
  const id = env.BYOK_ENCRYPTION_KEY_ID ?? keys.keys().next().value;
  const key = id ? keys.get(id) : undefined;
  if (!id || !key) {
    throw new ByokEncryptionError(
      "Configure BYOK_ENCRYPTION_KEY or BYOK_ENCRYPTION_KEYS and select a valid BYOK_ENCRYPTION_KEY_ID.",
    );
  }
  return { id, key };
}

function additionalData(context: SecretContext): Buffer {
  return Buffer.from(`${context.userId}\0${context.providerId}\0${context.provider}`, "utf8");
}

export function canEncryptByokKeys() {
  try {
    activeKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, context: SecretContext): string {
  const { id, key } = activeKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(additionalData(context));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    Buffer.from(id, "utf8").toString("base64url"),
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, context?: SecretContext): string {
  const segments = payload.split(".");
  if (segments.length === 3) return decryptLegacySecret(segments);
  if (segments.length !== 5 || segments[0] !== ENVELOPE_VERSION || !context) {
    throw new ByokEncryptionError("Invalid encrypted secret format or missing secret context.");
  }

  const [, encodedKeyId, iv, tag, data] = segments;
  const keyId = Buffer.from(encodedKeyId!, "base64url").toString("utf8");
  const key = loadKeyring().get(keyId);
  if (!key) throw new ByokEncryptionError(`BYOK encryption key "${keyId}" is unavailable.`);

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv!, "base64url"));
  decipher.setAAD(additionalData(context));
  decipher.setAuthTag(Buffer.from(tag!, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data!, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function decryptLegacySecret(segments: string[]): string {
  const [iv, tag, data] = segments;
  const key = loadKeyring().get(LEGACY_KEY_ID) ?? activeKey().key;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv!, "base64url"));
  decipher.setAuthTag(Buffer.from(tag!, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data!, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function keyLast4(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}
