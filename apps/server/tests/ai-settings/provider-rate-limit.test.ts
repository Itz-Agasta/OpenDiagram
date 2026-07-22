/** Verifies Hono admission middleware limits external provider requests without throttling local updates. */
import { beforeEach, describe, expect, test } from "bun:test";
import type { AuditableLogger } from "evlog";
import { Hono } from "hono";
import { resetRateLimitsForTests } from "../../src/lib/ai-provider/rate-limit";
import type { AuthVariables } from "../../src/lib/require-auth";
import { providerRequestLimit } from "../../src/routes/ai-settings/middleware";

const log = { set() {} } as unknown as AuditableLogger;

function testApp(shouldLimit: () => boolean = () => true) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use("*", async (context, next) => {
    context.set("userId", "user-1");
    context.set("log", log);
    await next();
  });
  app.post("/probe", providerRequestLimit("test_operation", shouldLimit), (context) =>
    context.json({ ok: true }),
  );
  return app;
}

describe("provider request limit middleware", () => {
  beforeEach(resetRateLimitsForTests);

  test("returns 429 with Retry-After after ten provider requests", async () => {
    const app = testApp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await app.request("/probe", { method: "POST" })).status).toBe(200);
    }
    const blocked = await app.request("/probe", { method: "POST" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
  });

  test("skips limits for updates that do not contact a provider", async () => {
    const app = testApp(() => false);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await app.request("/probe", { method: "POST" })).status).toBe(200);
    }
  });
});
