import { auth } from "@OpenDiagram/auth";
import type { EvlogVariables } from "evlog/hono";
import { createMiddleware } from "hono/factory";

export type AuthVariables = EvlogVariables & {
  userId: string;
};

/**
 * Gate a route behind a valid Better Auth session.
 * The evlog `identifyUser` middleware only tags logs -- it does not block.
 * On success, stashes the authenticated user id in context as `userId`.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("userId", session.user.id);
  await next();
});
