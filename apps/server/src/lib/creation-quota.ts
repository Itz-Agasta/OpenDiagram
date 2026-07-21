import { auth } from "@OpenDiagram/auth";
import { and, db, eq, sql } from "@OpenDiagram/db";
import { creationUsage } from "@OpenDiagram/db/schema/creation-usage";
import { env } from "@OpenDiagram/env/server";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

const GUEST_COOKIE = "opendiagram_guest_id";
const GUEST_LIMIT = 3;
const USER_LIMIT = 10;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
const BETA_QUOTA_WINDOW_START = new Date(Date.UTC(2026, 6, 1));

export type CreationQuotaActor = {
  actorType: "guest" | "user";
  actorId: string;
  limit: number;
  windowStart: Date;
};

export type CreationQuotaSnapshot = {
  actorType: "guest" | "user";
  limit: number;
  used: number;
  remaining: number;
  resetAt: null;
};

export class CreationQuotaExceededError extends Error {
  snapshot: CreationQuotaSnapshot;

  constructor(snapshot: CreationQuotaSnapshot) {
    super(
      snapshot.actorType === "guest"
        ? "You've used all 3 free beta creation requests. Sign in to get 10 beta requests."
        : "You've used all 10 beta creation requests.",
    );
    this.name = "CreationQuotaExceededError";
    this.snapshot = snapshot;
  }
}

export async function getCreationQuotaActor(
  c: Context,
  options: { userId?: string } = {},
): Promise<CreationQuotaActor> {
  const session = options.userId
    ? null
    : await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  const userId = options.userId ?? session?.user.id;

  if (userId) {
    return {
      actorType: "user",
      actorId: userId,
      limit: USER_LIMIT,
      windowStart: BETA_QUOTA_WINDOW_START,
    };
  }

  let guestId = getCookie(c, GUEST_COOKIE);
  if (!guestId) {
    guestId = crypto.randomUUID();
    setCookie(c, GUEST_COOKIE, guestId, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE,
      path: "/",
      sameSite: "Lax",
      secure: env.NODE_ENV === "production",
    });
  }

  return {
    actorType: "guest",
    actorId: guestId,
    limit: GUEST_LIMIT,
    windowStart: BETA_QUOTA_WINDOW_START,
  };
}

export async function getCreationQuotaSnapshot(
  actor: CreationQuotaActor,
): Promise<CreationQuotaSnapshot> {
  const [row] = await db
    .select({ count: creationUsage.count })
    .from(creationUsage)
    .where(
      and(
        eq(creationUsage.actorType, actor.actorType),
        eq(creationUsage.actorId, actor.actorId),
        eq(creationUsage.windowStart, actor.windowStart),
      ),
    );

  return toSnapshot(actor, row?.count ?? 0);
}

export async function consumeCreationQuota(actor: CreationQuotaActor) {
  const [row] = await db
    .insert(creationUsage)
    .values({
      actorType: actor.actorType,
      actorId: actor.actorId,
      windowStart: actor.windowStart,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [creationUsage.actorType, creationUsage.actorId, creationUsage.windowStart],
      set: {
        count: sql`${creationUsage.count} + 1`,
        updatedAt: new Date(),
      },
      where: sql`${creationUsage.count} < ${actor.limit}`,
    })
    .returning({ count: creationUsage.count });

  if (!row) {
    throw new CreationQuotaExceededError(await getCreationQuotaSnapshot(actor));
  }

  return toSnapshot(actor, row.count);
}

export function applyCreationQuotaHeaders(c: Context, snapshot: CreationQuotaSnapshot) {
  c.header("X-CreationQuota-Limit", String(snapshot.limit));
  c.header("X-CreationQuota-Used", String(snapshot.used));
  c.header("X-CreationQuota-Remaining", String(snapshot.remaining));
}

export function creationQuotaExceededResponse(c: Context, error: CreationQuotaExceededError) {
  applyCreationQuotaHeaders(c, error.snapshot);
  return c.json(
    {
      error: error.message,
      code: "creation_quota_exceeded",
      quota: error.snapshot,
    },
    429,
  );
}

function toSnapshot(actor: CreationQuotaActor, used: number): CreationQuotaSnapshot {
  return {
    actorType: actor.actorType,
    limit: actor.limit,
    used,
    remaining: Math.max(actor.limit - used, 0),
    resetAt: null,
  };
}
