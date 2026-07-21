import { auth } from "@OpenDiagram/auth";
import { db } from "@OpenDiagram/db";
import { waitlist } from "@OpenDiagram/db/schema/waitlist";
import { env } from "@OpenDiagram/env/server";
import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import { z } from "zod";
import { consumeWaitlistRateLimit } from "../lib/waitlist-rate-limit";

export const waitlistRoute = new Hono();

const joinSchema = z.object({
  email: z.string().trim().email().optional(),
});

function clientAddress(c: Parameters<typeof getConnInfo>[0]) {
  const trustedHeader = env.TRUSTED_PROXY_IP_HEADER;
  if (trustedHeader) {
    const forwarded = c.req.header(trustedHeader);
    if (forwarded) {
      return trustedHeader === "x-forwarded-for" ? forwarded.split(",")[0]!.trim() : forwarded;
    }
  }

  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
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

  const rateLimitKey = userId ? `user:${userId}` : `ip:${clientAddress(c)}`;
  const rateLimit = await consumeWaitlistRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    c.header("Retry-After", String(rateLimit.retryAfterSeconds));
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
