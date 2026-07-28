import type { Context } from "hono";
import type { CreationQuotaSnapshot } from "./credits";

export class CreationQuotaExceededError extends Error {
  snapshot: CreationQuotaSnapshot;

  constructor(snapshot: CreationQuotaSnapshot, scope: "window" | "day" = "window") {
    super(
      snapshot.limit <= 0
        ? "Creation requests are currently unavailable for this account."
        : scope === "day"
          ? "You've hit today's creation limit. It resets tomorrow."
          : snapshot.actorType === "guest"
            ? `You've used all ${snapshot.limit} free creation requests. Sign in for more.`
            : `You've used all ${snapshot.limit} creation requests for this billing period.`,
    );
    this.name = "CreationQuotaExceededError";
    this.snapshot = snapshot;
  }
}

export class CostCeilingExceededError extends Error {
  constructor(readonly ceilingCents: number) {
    super(
      "This account has reached its AI spend limit for the current billing period. " +
        "It resets at the start of the next period.",
    );
    this.name = "CostCeilingExceededError";
  }
}

export class AiRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRateLimitError";
  }
}

export function applyCreationQuotaHeaders(c: Context, snapshot: CreationQuotaSnapshot) {
  c.header("X-CreationQuota-Limit", String(snapshot.limit));
  c.header("X-CreationQuota-Used", String(snapshot.used));
  c.header("X-CreationQuota-Remaining", String(snapshot.remaining));
}

export function isQuotaError(error: unknown): boolean {
  return (
    error instanceof CreationQuotaExceededError ||
    error instanceof CostCeilingExceededError ||
    error instanceof AiRateLimitError
  );
}

/**
 * Maps any quota failure onto the 429 shape the web client already handles.
 * Returns null for anything that isn't a quota error, so callers can rethrow.
 */
export function quotaErrorResponse(c: Context, error: unknown) {
  if (error instanceof CreationQuotaExceededError) {
    applyCreationQuotaHeaders(c, error.snapshot);
    return c.json(
      { error: error.message, code: "creation_quota_exceeded", quota: error.snapshot },
      429,
    );
  }
  if (error instanceof CostCeilingExceededError) {
    return c.json({ error: error.message, code: "cost_ceiling_exceeded" }, 429);
  }
  if (error instanceof AiRateLimitError) {
    return c.json({ error: error.message, code: "rate_limited" }, 429);
  }
  return null;
}
