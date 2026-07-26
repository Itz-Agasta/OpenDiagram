/**
 * The user-facing credit counter. Holds the atomic `creation_usage` primitives
 * and the consume/refund logic layered on top of them.
 */
import { and, db, eq, sql } from "@OpenDiagram/db";
import { creationUsage, type CreationUsagePeriod } from "@OpenDiagram/db/schema/creation-usage";
import type { PlanId } from "@OpenDiagram/db/schema/plan";
import type { CreationQuotaActor } from "./actor";
import { CreationQuotaExceededError } from "./errors";

/**
 * Per-IP daily ceiling for guests, as a multiple of the guest daily cap.
 * Clearing cookies mints a fresh guest identity, so the cookie bucket alone
 * can't bound guest spend. This backstop does, without bricking a shared office
 * or campus NAT the way a 3-per-IP lifetime cap would.
 */
const GUEST_IP_CAP_MULTIPLIER = 3;

export type CreationQuotaSnapshot = {
  actorType: "guest" | "user";
  planId: PlanId;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
};

type CounterKey = {
  actorType: "guest" | "user";
  actorId: string;
  period: CreationUsagePeriod;
  windowStart: Date;
};

/**
 * The day and IP counters a consume touched, handed back so a refund decrements
 * the same rows.
 *
 * Recomputing "today" at refund time is wrong across UTC midnight: a request that
 * increments at 23:59:5x and fails at 00:00:0x would decrement *tomorrow's* row,
 * leaving today's incremented -- the user silently loses a credit, and the loss
 * favours us, which is the direction that generates support tickets.
 */
export type DayKey = { day: CounterKey; ip: CounterKey | null };

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function match(key: CounterKey) {
  return and(
    eq(creationUsage.actorType, key.actorType),
    eq(creationUsage.actorId, key.actorId),
    eq(creationUsage.period, key.period),
    eq(creationUsage.windowStart, key.windowStart),
  );
}

async function readCount(key: CounterKey): Promise<number> {
  const [row] = await db
    .select({ count: creationUsage.count })
    .from(creationUsage)
    .where(match(key));
  return row?.count ?? 0;
}

/**
 * Atomic increment that refuses to cross `limit`, returning null when the limit
 * is already reached. The conditional onConflictDoUpdate is what makes parallel
 * requests unable to overcount: the check and the write are a single statement,
 * so there's no read-then-write race to lose.
 */
async function increment(key: CounterKey, limit: number): Promise<number | null> {
  const [row] = await db
    .insert(creationUsage)
    .values({ ...key, count: 1 })
    .onConflictDoUpdate({
      target: [
        creationUsage.actorType,
        creationUsage.actorId,
        creationUsage.period,
        creationUsage.windowStart,
      ],
      set: { count: sql`${creationUsage.count} + 1`, updatedAt: new Date() },
      where: sql`${creationUsage.count} < ${limit}`,
    })
    .returning({ count: creationUsage.count });
  return row?.count ?? null;
}

async function decrement(key: CounterKey): Promise<void> {
  await db
    .update(creationUsage)
    .set({ count: sql`GREATEST(${creationUsage.count} - 1, 0)`, updatedAt: new Date() })
    .where(match(key));
}

function toSnapshot(actor: CreationQuotaActor, used: number): CreationQuotaSnapshot {
  return {
    actorType: actor.actorType,
    planId: actor.planId,
    limit: actor.limit,
    used,
    remaining: Math.max(actor.limit - used, 0),
    resetAt: actor.resetAt?.toISOString() ?? null,
  };
}

/** The three counter keys one request touches. IP bucket is guests only. */
function keysFor(actor: CreationQuotaActor, today: Date) {
  return {
    month: {
      actorType: actor.actorType,
      actorId: actor.actorId,
      period: "month",
      windowStart: actor.windowStart,
    } satisfies CounterKey,
    day: {
      actorType: actor.actorType,
      actorId: actor.actorId,
      period: "day",
      windowStart: today,
    } satisfies CounterKey,
    ip: actor.ipBucketId
      ? ({
          actorType: "guest",
          actorId: actor.ipBucketId,
          period: "day",
          windowStart: today,
        } satisfies CounterKey)
      : null,
  };
}

export async function getCreationQuotaSnapshot(
  actor: CreationQuotaActor,
): Promise<CreationQuotaSnapshot> {
  const used = await readCount(keysFor(actor, startOfUtcDay(new Date())).month);
  return toSnapshot(actor, used);
}

/**
 * Consumes one credit against the billing window, the day, and (for guests) the
 * shared IP bucket. Earlier increments are rolled back when a later one refuses,
 * so a request blocked by the daily cap doesn't silently eat a window credit.
 */
export async function consumeCreationQuota(
  actor: CreationQuotaActor,
): Promise<{ snapshot: CreationQuotaSnapshot; day: DayKey }> {
  if (actor.limit <= 0) throw new CreationQuotaExceededError(toSnapshot(actor, 0));

  const keys = keysFor(actor, startOfUtcDay(new Date()));

  const windowCount = await increment(keys.month, actor.limit);
  if (windowCount === null) {
    throw new CreationQuotaExceededError(await getCreationQuotaSnapshot(actor));
  }

  if ((await increment(keys.day, actor.plan.dailyCap)) === null) {
    await decrement(keys.month);
    throw new CreationQuotaExceededError(toSnapshot(actor, windowCount - 1), "day");
  }

  if (keys.ip) {
    const ipCap = actor.plan.dailyCap * GUEST_IP_CAP_MULTIPLIER;
    if ((await increment(keys.ip, ipCap)) === null) {
      await decrement(keys.day);
      await decrement(keys.month);
      throw new CreationQuotaExceededError(toSnapshot(actor, windowCount - 1), "day");
    }
  }

  return { snapshot: toSnapshot(actor, windowCount), day: { day: keys.day, ip: keys.ip } };
}

/**
 * Burns the actor's whole remaining window allowance.
 *
 * The clawback path: a refund or dispute means the money went back, so the
 * credits have to go with it. Downgrading the plan alone isn't enough -- that
 * just moves the user onto the Free window, where the counter is untouched and
 * they'd collect a fresh allowance out of the refund.
 */
export async function exhaustCreationQuota(actor: CreationQuotaActor): Promise<void> {
  const key = keysFor(actor, startOfUtcDay(new Date())).month;
  await db
    .insert(creationUsage)
    .values({ ...key, count: actor.limit })
    .onConflictDoUpdate({
      target: [
        creationUsage.actorType,
        creationUsage.actorId,
        creationUsage.period,
        creationUsage.windowStart,
      ],
      // GREATEST so a user already over the (now lower) limit isn't credited back.
      set: { count: sql`GREATEST(${creationUsage.count}, ${actor.limit})`, updatedAt: new Date() },
    });
}

/**
 * Gives the credit back when the AI call that consumed it produced nothing --
 * a model 503 or exhausted retries shouldn't cost a paid credit.
 */
export async function refundCreationQuota(
  actor: CreationQuotaActor,
  /**
   * The day/IP counters the matching consume incremented. Pass it: recomputing
   * "today" here decrements the wrong row when a request spans UTC midnight.
   * Defaults to today only for callers that never held one.
   */
  day: DayKey | null = null,
): Promise<void> {
  const keys = keysFor(actor, startOfUtcDay(new Date()));
  // The month key is the billing window, not the clock, so it never drifts.
  await decrement(keys.month);
  await decrement(day?.day ?? keys.day);
  const ip = day ? day.ip : keys.ip;
  if (ip) await decrement(ip);
}
