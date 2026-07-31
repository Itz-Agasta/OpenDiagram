import { createMiddleware } from "hono/factory";

import { getRequestSession, type SessionVariables } from "./session";

// `SessionVariables` already unwraps evlog's `{ Variables: { log } }` wrapper,
// and every call site spells `new Hono<{ Variables: AuthVariables }>()`.
// Spreading a wrapper would nest it a second time and hide `log` behind
// `c.get("Variables")` -- that is what keeps `c.get("log")` typed on auth routes.
export type AuthVariables = SessionVariables & {
  userId: string;
};

/**
 * Gate a route behind a valid Better Auth session.
 * The `resolveSession` middleware only tags logs -- it does not block.
 * On success, stashes the authenticated user id in context as `userId`.
 *
 * Reads the session memoised for this request rather than resolving its own.
 * That resolution is two database queries, and running it here as well as in
 * `resolveSession` was doubling the auth cost of every guarded route.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const session = await getRequestSession(c);
  if (!session) {
    // A failed lookup is not a missing session. Answering 401 during a database
    // outage tells every signed-in client it has been logged out, and the web app
    // acts on that by clearing state and redirecting to /login -- turning a blip
    // into a site-wide logout that outlives it. 503 says "try again", which is
    // both true and non-destructive.
    if (c.get("sessionUnavailable")) {
      return c.json({ error: "Authentication is temporarily unavailable" }, 503);
    }
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("userId", session.user.id);
  await next();
});
