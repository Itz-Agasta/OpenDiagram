/** Verifies the per-user fixed-window guard used by outbound BYOK operations. */
import { beforeEach, describe, expect, test } from "bun:test";
import { consumeRateLimit, resetRateLimitsForTests } from "../../src/lib/ai-provider/rate-limit";

describe("BYOK rate limiting", () => {
  beforeEach(resetRateLimitsForTests);

  test("blocks requests beyond the configured window limit", () => {
    const options = { limit: 2, windowMs: 1_000 };
    expect(consumeRateLimit("user:list", options, 100).allowed).toBe(true);
    expect(consumeRateLimit("user:list", options, 200).allowed).toBe(true);
    expect(consumeRateLimit("user:list", options, 300).allowed).toBe(false);
  });

  test("isolates users and resets expired windows", () => {
    const options = { limit: 1, windowMs: 1_000 };
    expect(consumeRateLimit("user-a:list", options, 100).allowed).toBe(true);
    expect(consumeRateLimit("user-b:list", options, 200).allowed).toBe(true);
    expect(consumeRateLimit("user-a:list", options, 1_101).allowed).toBe(true);
  });
});
