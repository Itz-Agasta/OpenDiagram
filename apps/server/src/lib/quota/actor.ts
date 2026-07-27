/**
 * Who is asking, and what are they allowed. Covers the guest cookie identity,
 * the plan table read, the billing window math, and the resolution that ties
 * them together into a `CreationQuotaActor`.
 */
import { auth } from "@OpenDiagram/auth";
import { and, db, eq, inArray, sql } from "@OpenDiagram/db";
import { user } from "@OpenDiagram/db/schema/auth";
import { plan, type PlanId } from "@OpenDiagram/db/schema/plan";
import { ENTITLING_SUBSCRIPTION_STATUSES, subscription } from "@OpenDiagram/db/schema/subscription";
import { env } from "@OpenDiagram/env/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

export type Plan = typeof plan.$inferSelect;

export type CreationQuotaActor = {
  actorType: "guest" | "user";
  actorId: string;
  planId: PlanId;
  plan: Plan;
  /** Credits for this window: the signup grant during a new account's first one. */
  limit: number;
  windowStart: Date;
  /** When `limit` refreshes. Null for the lifetime guest allowance. */
  resetAt: Date | null;
  /** Hashed client IP bucket, guests only. Null when the IP is unknown. */
  ipBucketId: string | null;
};

const GUEST_COOKIE = "opendiagram_guest_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

// Guests have no billing anchor, so their allowance is lifetime rather than
// windowed. A fixed epoch gives every guest row the same windowStart.
const GUEST_WINDOW_START = new Date(Date.UTC(2026, 6, 1));

// Plans are cached briefly because every limit lives in that table as data: an
// operator changing the Pro allowance expects it to take effect without a
// restart, but the AI hot path shouldn't pay a round trip per request for a
// table that changes a few times a year.
const PLAN_CACHE_TTL_MS = 60_000;
const planCache = new Map<PlanId, { plan: Plan; expiresAt: number }>();

export async function getPlan(id: PlanId): Promise<Plan> {
  const hit = planCache.get(id);
  if (hit && hit.expiresAt > Date.now()) return hit.plan;

  const [row] = await db.select().from(plan).where(eq(plan.id, id)).limit(1);
  if (!row) {
    // The seed migration inserts guest/free/pro. A missing row means migrations
    // haven't run, and silently defaulting would hand out free inference.
    throw new Error(`Plan "${id}" is missing from the plan table. Run db:migrate.`);
  }

  planCache.set(id, { plan: row, expiresAt: Date.now() + PLAN_CACHE_TTL_MS });
  return row;
}

// Guest ids are server-signed so a client can't mint arbitrary identities. The
// old scheme handed out a plain UUID and trusted whatever came back, which made
// the bucket forgeable. Signing doesn't stop a cookie wipe from earning a fresh
// allowance -- the per-IP bucket in credits.ts is what bounds that.
function signNonce(nonce: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(nonce).digest("base64url");
}

function readGuestId(c: Context): string | null {
  const token = getCookie(c, GUEST_COOKIE);
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const nonce = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(signNonce(nonce));

  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? nonce : null;
}

function readOrIssueGuestId(c: Context): string {
  const existing = readGuestId(c);
  if (existing) return existing;

  const nonce = crypto.randomUUID();
  setCookie(c, GUEST_COOKIE, `${nonce}.${signNonce(nonce)}`, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    sameSite: "Lax",
    secure: env.NODE_ENV === "production",
  });
  return nonce;
}

/**
 * Hashed rather than raw so the usage table doesn't become a log of visitor IPs.
 *
 * Takes the RIGHTMOST `X-Forwarded-For` entry, not the leftmost. Our proxy
 * (Cloud Run) *appends* the address it observed, so the rightmost entry is the
 * only one the platform vouches for -- everything to its left was supplied by
 * the caller. Reading the leftmost made this bucket worthless for its actual
 * job: a client could send its own `X-Forwarded-For`, rotate the value per
 * request, and mint a fresh bucket every time. Since the guest cookie is
 * deletable by design, that left guest spend with no bound at all.
 *
 * If a CDN is ever put in front of Cloud Run, this becomes "rightmost minus N
 * trusted hops" -- still counted from the right, never from the left.
 */
function hashClientIp(c: Context): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  const hops =
    forwarded
      ?.split(",")
      .map((hop) => hop.trim())
      .filter(Boolean) ?? [];
  const ip = hops.at(-1) || c.req.header("x-real-ip")?.trim();
  if (!ip) return null;
  return `ip:${createHmac("sha256", env.BETTER_AUTH_SECRET).update(ip).digest("hex").slice(0, 32)}`;
}

/** Clamps the day, so 31 Jan + 1 month lands on the last day of February. */
function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const daysInTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), daysInTarget),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * The monthly window containing `now`, counted from `anchor` rather than the
 * calendar 1st. Free accounts anchor on signup: a calendar window would drop
 * someone who signed up on the 28th from 25 signup credits to 5 after three
 * days, which is exactly the cold start the grant exists to buy. `index` is 0
 * during the first window.
 */
function anniversaryWindow(anchor: Date, now: Date) {
  let index =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());
  if (addMonthsUtc(anchor, index) > now) index -= 1;
  return { index, start: addMonthsUtc(anchor, index), end: addMonthsUtc(anchor, index + 1) };
}

type PaidWindow = {
  planId: PlanId;
  windowStart: Date;
  resetAt: Date;
  windowIndex: number;
};

// Keyed on the period end, not the status alone: `cancelled` and `on_hold` both
// still entitle while the period the user paid for is running.
async function resolvePaidWindow(userId: string): Promise<PaidWindow | null> {
  const [row] = await db
    .select({
      planId: subscription.planId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
    })
    .from(subscription)
    .where(
      and(
        eq(subscription.userId, userId),
        // From the schema, so this and the checkout duplicate guard cannot drift --
        // see ENTITLING_SUBSCRIPTION_STATUSES for what each status means here.
        inArray(subscription.status, [...ENTITLING_SUBSCRIPTION_STATUSES]),
        sql`${subscription.currentPeriodEnd} > NOW()`,
      ),
    )
    .orderBy(sql`${subscription.currentPeriodEnd} DESC`)
    .limit(1);

  if (!row) return null;

  return {
    planId: row.planId,
    windowStart: row.currentPeriodStart,
    resetAt: row.currentPeriodEnd,
    // A paid window never grants the signup allowance.
    windowIndex: 1,
  };
}

async function guestActor(c: Context, actorId: string): Promise<CreationQuotaActor> {
  const guestPlan = await getPlan("guest");
  return {
    actorType: "guest",
    actorId,
    planId: "guest",
    plan: guestPlan,
    limit: guestPlan.monthlyCredits,
    windowStart: GUEST_WINDOW_START,
    resetAt: null,
    ipBucketId: hashClientIp(c),
  };
}

/**
 * The actor for a known user id. `c` is optional because the webhook handler and
 * the billing route act on a user with no inbound request to read an IP from.
 */
export async function getUserActor(userId: string): Promise<CreationQuotaActor> {
  return userActor(userId);
}

async function userActor(userId: string, c?: Context): Promise<CreationQuotaActor> {
  const now = new Date();
  const [account] = await db
    .select({ createdAt: user.createdAt, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const paid = await resolvePaidWindow(userId);

  // An unverified account stays on the guest allowance. Without this, 5 free
  // diagrams a month costs one throwaway address to farm indefinitely.
  if (!paid && !account?.emailVerified) {
    const guestPlan = await getPlan("guest");
    return {
      actorType: "user",
      actorId: userId,
      planId: "guest",
      plan: guestPlan,
      limit: guestPlan.monthlyCredits,
      windowStart: GUEST_WINDOW_START,
      resetAt: null,
      // Unverified accounts get the IP backstop too. Signing up needs only a
      // syntactically valid address, so without this each throwaway address is 3
      // lifetime platform credits with nothing bounding how many you make --
      // strictly easier to farm than the guest path it borrows its limits from.
      ipBucketId: c ? hashClientIp(c) : null,
    };
  }

  let window = paid;
  if (!window) {
    const free = anniversaryWindow(account?.createdAt ?? now, now);
    window = {
      planId: "free",
      windowStart: free.start,
      resetAt: free.end,
      windowIndex: free.index,
    };
  }
  const activePlan = await getPlan(window.planId);

  return {
    actorType: "user",
    actorId: userId,
    planId: window.planId,
    plan: activePlan,
    // The signup grant replaces the monthly allowance in the first window
    // rather than stacking with it: "25 on signup, then 5/mo".
    limit:
      window.windowIndex === 0 && activePlan.signupGrant > 0
        ? activePlan.signupGrant
        : activePlan.monthlyCredits,
    windowStart: window.windowStart,
    resetAt: window.resetAt,
    ipBucketId: null,
  };
}

async function currentUserId(c: Context, explicit?: string): Promise<string | undefined> {
  if (explicit) return explicit;
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  return session?.user.id;
}

export async function getCreationQuotaActor(
  c: Context,
  options: { userId?: string } = {},
): Promise<CreationQuotaActor> {
  const userId = await currentUserId(c, options.userId);
  return userId ? userActor(userId, c) : guestActor(c, readOrIssueGuestId(c));
}

/**
 * Read-only variant for GET endpoints. The normal path issues a guest cookie as
 * a side effect, so polling a usage endpoint with it mints a new guest identity
 * on every call. Returns null for an anonymous caller with no cookie yet.
 */
export async function peekCreationQuotaActor(
  c: Context,
  options: { userId?: string } = {},
): Promise<CreationQuotaActor | null> {
  const userId = await currentUserId(c, options.userId);
  if (userId) return userActor(userId, c);

  const guestId = readGuestId(c);
  return guestId ? guestActor(c, guestId) : null;
}
