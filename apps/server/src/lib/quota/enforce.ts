/**
 * The single gate every AI route goes through.
 *
 * It takes the `ResolvedModel` rather than a user id on purpose. BYOK calls cost
 * us nothing and must not be metered, and the previous design left that decision
 * to each call site -- which is how project chat and repo generation ended up
 * charging BYOK users. Requiring the resolved provider here makes the bypass
 * impossible to forget, and it's decided from the provider that actually ran,
 * never a user-level flag that could go stale into a free-inference hole.
 *
 * Layers run cheapest-rejection-first: concurrency, burst, then the DB-backed
 * daily cap, window credits, and cost ceiling.
 */
import type { Context } from "hono";
import type { ResolvedModel } from "../ai-provider/resolve";
import { getCreationQuotaActor, type CreationQuotaActor } from "./actor";
import { isTurnAlreadyCharged, releaseAiCost, reserveAiCost, settleAiCost } from "./cost-ceiling";
import {
  consumeCreationQuota,
  getCreationQuotaSnapshot,
  refundCreationQuota,
  type DayKey,
} from "./credits";
import { AiRateLimitError, applyCreationQuotaHeaders } from "./errors";

export type AiQuotaGrant = {
  /** Reconciles the reservation to actual token usage. Idempotent. */
  settle(usage: { inputTokens: number; outputTokens: number }): Promise<void>;
  /** Refunds the credit and zeroes the reservation. Call when the model failed. Idempotent. */
  release(): Promise<void>;
};

const NOOP_GRANT: AiQuotaGrant = {
  settle: async () => {},
  release: async () => {},
};

// Burst and concurrency live in process memory, which means they are NOT global
// limits and must not be reasoned about as if they were. On Cloud Run the real
// figure is `plan limit x live instance count`, and instance count rises with load
// -- so the limit loosens exactly when it should tighten. Scale-to-zero also wipes
// both maps, so a caller who pauses until the instance recycles gets a fresh window.
//
// They are kept here anyway, deliberately. Their only job is keeping *us* inside
// the AI provider's own rate limits, and moving them to Postgres would put two
// extra round trips on every AI request to enforce something the cost ceiling
// already bounds. A correct distributed token bucket means Redis: another
// dependency and another bill, for no additional spend protection.
//
// The bounds that actually hold are both in the database and both race-safe: the
// credit counter (credits.ts) and the cost ceiling (cost-ceiling.ts). If a genuine
// global request limit is ever needed, it belongs in front of the app -- Cloud Run
// max-instances, or a Cloud Armor rate-limit rule -- not in this file.
const BURST_WINDOW_MS = 60_000;
const inFlight = new Map<string, number>();
const recentRequests = new Map<string, number[]>();

function acquireSlot(actorId: string, max: number): boolean {
  const current = inFlight.get(actorId) ?? 0;
  if (current >= max) return false;
  inFlight.set(actorId, current + 1);
  return true;
}

function releaseSlot(actorId: string): void {
  const current = inFlight.get(actorId) ?? 0;
  if (current <= 1) inFlight.delete(actorId);
  else inFlight.set(actorId, current - 1);
}

function tryConsumeBurst(bucket: string, perMinute: number): boolean {
  const now = Date.now();
  const recent = (recentRequests.get(bucket) ?? []).filter((at) => now - at < BURST_WINDOW_MS);
  recentRequests.set(bucket, recent);
  if (recent.length >= perMinute) return false;
  recent.push(now);
  return true;
}

/**
 * Gate for a cheap AI call that isn't a creation: rate limit only, no credit and
 * no cost reservation.
 *
 * Intent routing is the only such call. It runs on a platform key, so it can't be
 * left ungated, but charging it a creation credit would double-charge the turn --
 * the user's actual diagram request is metered a moment later on the same intent.
 *
 * `userId` is required rather than optional on purpose. A guest bucket keys on a
 * cookie the client can simply drop, which makes a burst limit worthless on its
 * own; a session id can't be reset that way. Callers must therefore sit behind
 * `requireAuth`.
 *
 * Its own bucket, not the creation bucket, so routing a request doesn't spend the
 * allowance the creation that follows it needs.
 */
export async function enforceAiBurst(c: Context, route: string, userId: string): Promise<void> {
  const actor = await getCreationQuotaActor(c, { userId });
  if (!tryConsumeBurst(`${route}:${actor.actorId}`, actor.plan.burstPerMinute)) {
    throw new AiRateLimitError("Too many requests. Try again in a minute.");
  }
}

/**
 * Consumes quota for one AI call, or throws a quota error. The returned grant
 * must be settled on success and released on failure -- leaking one leaves a
 * pessimistic reservation on the account until the window rolls.
 *
 * `userId` is optional and only skips a redundant session read for routes that
 * already resolved it.
 *
 * `turnId` makes the credit charge per *conversation turn* rather than per HTTP
 * request. An agent loop can span several requests for one user message -- the model
 * calling the client-side `ask_user` tool ends the turn and the client resubmits --
 * and charging each one meant a single prompt could cost two or three credits while
 * the UI promised one. Cost is still metered per request; only the credit is shared.
 * Omit it for paths with no conversation, which are charged once per job.
 */
export async function enforceAiQuota(
  c: Context,
  resolved: ResolvedModel,
  route: string,
  userId?: string,
  turnId?: string,
): Promise<AiQuotaGrant> {
  if (!resolved.countsAgainstQuota) return NOOP_GRANT;

  const actor = await getCreationQuotaActor(c, { userId });
  return grantFor(c, actor, resolved, route, turnId);
}

async function grantFor(
  c: Context,
  actor: CreationQuotaActor,
  resolved: ResolvedModel,
  route: string,
  turnId?: string,
): Promise<AiQuotaGrant> {
  if (!acquireSlot(actor.actorId, actor.plan.maxConcurrent)) {
    throw new AiRateLimitError(
      `Only ${actor.plan.maxConcurrent} AI requests can run at once. Wait for the current one to finish.`,
    );
  }

  let ledgerId: string;
  // A continuation of an already-charged turn takes no new credit, so there is
  // nothing to hand back if the reservation is later refused.
  let chargedCredit = false;
  let day: DayKey | null = null;
  try {
    // Burst is charged per HTTP request even within a turn: each one is a real
    // upstream call, and burst exists to keep us under the provider's own limits.
    if (!tryConsumeBurst(actor.actorId, actor.plan.burstPerMinute)) {
      throw new AiRateLimitError("Too many requests. Try again in a minute.");
    }

    const continuing = turnId ? await isTurnAlreadyCharged(actor, turnId) : false;
    if (!continuing) {
      const consumed = await consumeCreationQuota(actor);
      chargedCredit = true;
      day = consumed.day;
      applyCreationQuotaHeaders(c, consumed.snapshot);
    } else {
      applyCreationQuotaHeaders(c, await getCreationQuotaSnapshot(actor));
    }

    try {
      ledgerId = await reserveAiCost(actor, { route, modelId: resolved.modelId, turnId });
    } catch (error) {
      // The credit was already taken; hand it back before surfacing the ceiling.
      if (chargedCredit) await refundCreationQuota(actor, day);
      throw error;
    }
  } catch (error) {
    releaseSlot(actor.actorId);
    throw error;
  }

  // The slot gets its own idempotent release because it has an extra caller: an
  // aborted request frees the slot without settling or refunding anything.
  let slotReleased = false;
  const freeSlot = () => {
    if (slotReleased) return;
    slotReleased = true;
    releaseSlot(actor.actorId);
  };

  // A client that disconnects mid-stream (tab close, navigation) fires neither
  // onFinish nor onError, so without this the slot stays held for the lifetime of
  // this instance -- and at guest maxConcurrent 1, a single abandoned tab locks
  // that guest out of the instance completely.
  //
  // Only the slot is freed here, deliberately. The model call has very likely
  // already been made and already cost us, so the credit stays spent; the orphaned
  // reservation is handled by RESERVATION_TTL_MS in cost-ceiling.ts. Refunding
  // from an abort handler would risk racing a settle that is already in flight.
  c.req.raw.signal?.addEventListener("abort", freeSlot, { once: true });

  let settled = false;
  const finish = async (usage: { inputTokens: number; outputTokens: number } | null) => {
    if (settled) return;
    settled = true;
    freeSlot();
    if (usage) {
      await settleAiCost(ledgerId, { modelId: resolved.modelId, ...usage });
    } else {
      await Promise.all([
        releaseAiCost(ledgerId),
        // Only the request that actually took a credit gives one back. Refunding
        // from a continuation would credit the user for a turn they still had.
        chargedCredit ? refundCreationQuota(actor, day) : Promise.resolve(),
      ]);
    }
  };

  return {
    settle: (usage) => finish(usage),
    release: () => finish(null),
  };
}
