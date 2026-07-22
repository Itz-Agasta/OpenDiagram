/** Shared rate limiting and secret-safe observability for AI settings requests. */
import type { UserAiProviderKind } from "@OpenDiagram/db/schema/user-ai-provider";
import { createMiddleware } from "hono/factory";
import type { RequestLogger } from "evlog";
import type { AuthVariables } from "../../lib/require-auth";
import { consumeRateLimit } from "../../lib/ai-provider/rate-limit";

const PROVIDER_REQUEST_LIMIT = { limit: 10, windowMs: 60_000 } as const;

export function providerRequestLimit(
  operation: string,
  shouldLimit: (request: { json(): Promise<unknown> }) => boolean | Promise<boolean> = () => true,
) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (!(await shouldLimit(c.req.raw.clone()))) {
      await next();
      return;
    }
    const result = consumeRateLimit(`${c.get("userId")}:${operation}`, PROVIDER_REQUEST_LIMIT);
    recordRateLimit(c.get("log"), operation, result);
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json({ error: "Too many provider requests. Try again shortly." }, 429);
    }
    await next();
  });
}

function recordRateLimit(
  log: RequestLogger,
  operation: string,
  result: { allowed: boolean; limit: number; remaining: number },
) {
  log.set({
    byok: {
      operation,
      phase: result.allowed ? "accepted" : "rate_limited",
      rateLimit: { limit: result.limit, remaining: result.remaining },
    },
  });
}

export function recordByokOutcome(
  log: RequestLogger,
  input: {
    operation: string;
    provider?: UserAiProviderKind;
    result: "success" | "error";
    startedAt: number;
    modelCount?: number;
  },
) {
  log.set({
    byok: {
      operation: input.operation,
      provider: input.provider ?? null,
      phase: "complete",
      result: input.result,
      durationMs: Math.round(performance.now() - input.startedAt),
      modelCount: input.modelCount ?? null,
    },
  });
}

export function safeError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "UnknownError", message: "Unknown provider error" };
}
