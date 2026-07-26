/**
 * Composes the three things every non-streaming AI route needs into one call:
 * which model to run on, permission to run at all, and somewhere to report what
 * it cost.
 *
 * This sits above both `lib/quota` and `lib/repo-ai` rather than inside either,
 * because it is the seam between them. `lib/quota` deliberately knows nothing
 * about how models are invoked, and `lib/repo-ai` knows nothing about billing;
 * putting the glue in a route instead is what let project chat charge BYOK users
 * for inference we never paid for.
 *
 * Streaming routes (`routes/diagram.ts`) call `enforceAiQuota` directly, because
 * they settle from `onFinish`/`onError` callbacks rather than around an await.
 */
import type { Context } from "hono";
import { createLogger } from "evlog";
import { resolveModel } from "./ai-provider/resolve";
import { enforceAiQuota, quotaErrorResponse } from "./quota";
import type { AiCallOptions, AiUsage } from "./repo-ai";

const log = createLogger({ module: "ai-grant" });

export type AiGrant = {
  /** Pass to a repo-ai helper so it runs on the resolved model, not the platform default. */
  ai: AiCallOptions;
  /** Reconciles the cost reservation against every token this grant's calls reported. */
  settle: () => Promise<void>;
  release: () => Promise<void>;
};

/**
 * Takes the quota one AI request needs, or returns the error response to send.
 *
 * Returning a `Response` rather than throwing keeps the mapping from quota errors
 * to HTTP in one place; callers just do `if (grant instanceof Response) return grant`.
 *
 * `meter: false` resolves a model but takes no credit — for work already paid for
 * on a previous request, such as resuming an in-flight repo generation.
 */
export async function takeAiGrant(
  c: Context,
  userId: string,
  route: string,
  options: { meter?: boolean } = {},
): Promise<AiGrant | Response> {
  let resolved: Awaited<ReturnType<typeof resolveModel>>;
  try {
    resolved = await resolveModel(userId);
  } catch (error) {
    log.error("Failed to resolve BYOK model", { error });
    return c.json({ error: "Your saved AI provider key could not be used. Check Settings." }, 502);
  }
  if (!resolved) return c.json({ error: "No AI provider is configured." }, 503);

  let grant: Awaited<ReturnType<typeof enforceAiQuota>>;
  try {
    grant =
      options.meter === false
        ? { settle: async () => {}, release: async () => {} }
        : await enforceAiQuota(c, resolved, route, userId);
  } catch (error) {
    const response = quotaErrorResponse(c, error);
    if (response) return response;
    throw error;
  }

  // One grant can cover several model calls (repo generation makes four), so usage
  // accumulates rather than overwriting before it settles.
  const total: AiUsage = { inputTokens: 0, outputTokens: 0 };
  return {
    ai: {
      model: resolved.model,
      onUsage: (usage) => {
        total.inputTokens += usage.inputTokens;
        total.outputTokens += usage.outputTokens;
      },
    },
    settle: () => grant.settle(total),
    release: () => grant.release(),
  };
}
