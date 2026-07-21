import { auth } from "@OpenDiagram/auth";
import { db } from "@OpenDiagram/db";
import { waitlist } from "@OpenDiagram/db/schema/waitlist";
import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import { z } from "zod";

export const waitlistRoute = new Hono();

const RATE_LIMIT_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_KEYS = 10_000;

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitEntries = new Map<string, RateLimitEntry>();

const joinSchema = z.object({
  email: z.string().trim().email().optional(),
});

function clientAddress(c: Parameters<typeof getConnInfo>[0]) {
  // These headers must be overwritten by the deployment proxy. The Bun socket
  // address is the fallback for direct deployments and local development.
  const forwarded =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-real-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

function retryAfterSeconds(key: string, now: number) {
  const current = rateLimitEntries.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitEntries.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (current.count >= RATE_LIMIT_ATTEMPTS) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }

  current.count += 1;
  return null;
}

function pruneRateLimitEntries(now: number) {
  if (rateLimitEntries.size < RATE_LIMIT_MAX_KEYS) return;
  for (const [key, entry] of rateLimitEntries) {
    if (entry.resetAt <= now) rateLimitEntries.delete(key);
  }
  while (rateLimitEntries.size >= RATE_LIMIT_MAX_KEYS) {
    const oldestKey = rateLimitEntries.keys().next().value;
    if (typeof oldestKey !== "string") break;
    rateLimitEntries.delete(oldestKey);
  }
}

waitlistRoute.post("/join", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = joinSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid email." }, 400);
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const userId = session?.user.id ?? null;
  const email = (session?.user.email ?? parsed.data.email)?.trim().toLowerCase();

  if (!email) {
    return c.json({ error: "Email is required." }, 400);
  }

  const now = Date.now();
  pruneRateLimitEntries(now);
  const rateLimitKey = userId ? `user:${userId}` : `ip:${clientAddress(c)}`;
  const retryAfter = retryAfterSeconds(rateLimitKey, now);
  if (retryAfter !== null) {
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Too many waitlist attempts. Please try again later." }, 429);
  }

  const [row] = await db
    .insert(waitlist)
    .values({ userId, email })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    return c.json({ message: "You're already on the waitlist." });
  }

  return c.json({ message: "You're on the waitlist. We'll be in touch." }, 201);
});
