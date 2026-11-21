/** The credit counter against real Postgres (PGlite): what a user can and cannot be charged. */
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import type { CreationQuotaActor } from "../../src/lib/quota/actor";
import {
  consumeCreationQuota,
  exhaustCreationQuota,
  getCreationQuotaSnapshot,
  refundCreationQuota,
} from "../../src/lib/quota/credits";
import { CreationQuotaExceededError } from "../../src/lib/quota/errors";
import { resetDb } from "../support/db";

const WINDOW = new Date(Date.UTC(2026, 10, 1));

function actor(
  over: Partial<CreationQuotaActor> & { dailyCap?: number; ipMultiplier?: number } = {},
): CreationQuotaActor {
  const { dailyCap = 50, ipMultiplier = 3, ...rest } = over;
  return {
    actorType: "user",
    actorId: "u1",
    planId: "free",
    plan: {
      id: "free",
      name: "Free",
      monthlyCredits: 10,
      signupGrant: 10,
      dailyCap,
      ipDailyCapMultiplier: ipMultiplier,
      costCeilingCents: 100,
      burstPerMinute: 10,
      maxConcurrent: 2,
      createdAt: WINDOW,
      updatedAt: WINDOW,
    },
    limit: 3,
    windowStart: WINDOW,
    resetAt: null,
    ipBucketId: null,
    ...rest,
  };
}

const used = async (a: CreationQuotaActor) => (await getCreationQuotaSnapshot(a)).used;

beforeEach(resetDb);
afterEach(() => setSystemTime());

describe("creation credits", () => {
  test("a window of 3 gives exactly 3 credits, then refuses", async () => {
    const a = actor();
    for (let i = 0; i < 3; i++) await consumeCreationQuota(a);
    await expect(consumeCreationQuota(a)).rejects.toBeInstanceOf(CreationQuotaExceededError);
    expect(await getCreationQuotaSnapshot(a)).toMatchObject({ used: 3, remaining: 0 });
  });

  test("requests racing for the last credits cannot take more than the limit", async () => {
    const a = actor();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => consumeCreationQuota(a)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await used(a)).toBe(3);
  });

  test("a refusal from the daily cap does not eat a window credit", async () => {
    const a = actor({ dailyCap: 1, limit: 10 });
    await consumeCreationQuota(a);
    const second = consumeCreationQuota(a);
    await expect(second).rejects.toThrow("today's creation limit");
    expect(await used(a)).toBe(1);
  });

  test("a daily cap of 0 is a hard stop from the first request", async () => {
    const a = actor({ dailyCap: 0, limit: 10 });
    await expect(consumeCreationQuota(a)).rejects.toBeInstanceOf(CreationQuotaExceededError);
    expect(await used(a)).toBe(0);
  });

  test("a guest blocked by the shared IP bucket keeps every other credit", async () => {
    // dailyCap 1 x multiplier 1: one creation per IP per day, across guests.
    const guest = (actorId: string) =>
      actor({ actorType: "guest", actorId, ipBucketId: "ip-a", dailyCap: 1, ipMultiplier: 1 });
    const [one, two] = [guest("g1"), guest("g2")];
    const { day } = await consumeCreationQuota(one);
    await expect(consumeCreationQuota(two)).rejects.toThrow("today's creation limit");
    expect(await used(two)).toBe(0);
    // Free the IP bucket: two must now get through, so its own day counter
    // was rolled back too (dailyCap 1 would refuse a leaked one).
    await refundCreationQuota(one, day);
    await consumeCreationQuota(two);
  });

  test("a refund gives back the credit, on the day the request started even past midnight", async () => {
    const a = actor({ dailyCap: 1, limit: 10 });
    setSystemTime(new Date(Date.UTC(2026, 10, 21, 23, 59, 59)));
    const { day } = await consumeCreationQuota(a);
    setSystemTime(new Date(Date.UTC(2026, 10, 22, 0, 0, 1)));
    await refundCreationQuota(a, day);
    expect(await used(a)).toBe(0);
    // Back on the 21st, its day counter is free again: the refund hit that row.
    setSystemTime(new Date(Date.UTC(2026, 10, 21, 12)));
    await consumeCreationQuota(a);
  });

  test("a clawback burns what is left, and never credits back a user already over", async () => {
    const a = actor();
    await consumeCreationQuota(a);
    await exhaustCreationQuota(a);
    expect(await getCreationQuotaSnapshot(a)).toMatchObject({ used: 3, remaining: 0 });
    // The limit dropped below what was used (plan downgrade): usage stays.
    await exhaustCreationQuota({ ...a, limit: 1 });
    expect(await used(a)).toBe(3);
  });
});
