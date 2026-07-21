import { auth } from "@OpenDiagram/auth";
import { db } from "@OpenDiagram/db";
import { waitlist } from "@OpenDiagram/db/schema/waitlist";
import { Hono } from "hono";
import { z } from "zod";

export const waitlistRoute = new Hono();

const joinSchema = z.object({
  email: z.string().trim().email().optional(),
});

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
