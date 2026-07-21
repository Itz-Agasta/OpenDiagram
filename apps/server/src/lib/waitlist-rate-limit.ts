import { db, sql } from "@OpenDiagram/db";
import { waitlistRateLimit } from "@OpenDiagram/db/schema/waitlist-rate-limit";

const WAITLIST_RATE_LIMIT = 5;
const WAITLIST_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export type WaitlistRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export async function consumeWaitlistRateLimit(
  actorKey: string,
  now = new Date(),
): Promise<WaitlistRateLimitResult> {
  const windowStartMs =
    Math.floor(now.getTime() / WAITLIST_RATE_LIMIT_WINDOW_MS) * WAITLIST_RATE_LIMIT_WINDOW_MS;
  const windowStart = new Date(windowStartMs);
  const actorKeyHash = await sha256(actorKey);

  const [row] = await db
    .insert(waitlistRateLimit)
    .values({ actorKeyHash, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [waitlistRateLimit.actorKeyHash, waitlistRateLimit.windowStart],
      set: {
        count: sql`${waitlistRateLimit.count} + 1`,
        updatedAt: now,
      },
      where: sql`${waitlistRateLimit.count} < ${WAITLIST_RATE_LIMIT}`,
    })
    .returning({ count: waitlistRateLimit.count });

  if (row) return { allowed: true };

  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((windowStartMs + WAITLIST_RATE_LIMIT_WINDOW_MS - now.getTime()) / 1000),
    ),
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
