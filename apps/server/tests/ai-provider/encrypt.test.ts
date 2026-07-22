/** Verifies BYOK envelope integrity, contextual binding, and legacy compatibility. */
import { createCipheriv } from "node:crypto";
import { beforeAll, describe, expect, test } from "bun:test";

const encryptionKey = Buffer.alloc(32, 7);
const context = { userId: "user-1", providerId: "provider-1", provider: "google" };
let encryption: typeof import("../../src/lib/ai-provider/encrypt");

beforeAll(async () => {
  process.env.SKIP_ENV_VALIDATION = "1";
  process.env.BYOK_ENCRYPTION_KEYS = `primary=${encryptionKey.toString("base64")}`;
  process.env.BYOK_ENCRYPTION_KEY_ID = "primary";
  encryption = await import("../../src/lib/ai-provider/encrypt");
});

describe("BYOK encryption envelope", () => {
  test("round-trips a context-bound v1 secret", () => {
    const encrypted = encryption.encryptSecret("secret-value", context);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encryption.decryptSecret(encrypted, context)).toBe("secret-value");
  });

  test("rejects a secret moved to another provider row", () => {
    const encrypted = encryption.encryptSecret("secret-value", context);
    expect(() =>
      encryption.decryptSecret(encrypted, { ...context, providerId: "provider-2" }),
    ).toThrow();
  });

  test("continues to decrypt legacy iv.tag.ciphertext payloads", () => {
    const iv = Buffer.alloc(12, 3);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update("legacy-secret", "utf8"), cipher.final()]);
    const payload = [
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
    expect(encryption.decryptSecret(payload)).toBe("legacy-secret");
  });
});
