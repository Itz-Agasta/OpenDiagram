import { auth } from "@OpenDiagram/auth";
import { identifyUser } from "evlog/better-auth";
import type { EvlogVariables } from "evlog/hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

/** What `auth.api.getSession` hands back once it is known to be non-null. */
export type RequestSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * `session` is the memoised result for this request: `undefined` means nobody
 * has asked yet, `null` means we asked and there is no session. The two are
 * deliberately distinct -- collapsing them would make every anonymous request
 * re-resolve on each call.
 */
export type SessionVariables = EvlogVariables["Variables"] & {
  session: RequestSession | null;
  /**
   * Set when session resolution *failed* rather than came back empty. Keeps the
   * two apart for `requireAuth`, which owes a 401 to the first and a 503 to the
   * second -- see the catch in `getRequestSession`.
   */
  sessionUnavailable: boolean;
};

/** Better Auth owns these paths and resolves its own session inside the handler. */
function isAuthRoute(path: string) {
  return path.startsWith("/api/auth/");
}

/**
 * Resolve the Better Auth session at most once per request.
 *
 * Every `getSession` call is two database queries (`session`, then `user`) --
 * see `better-auth/dist/api/routes/session.mjs`, where a cache miss falls
 * through to `internalAdapter.findSession`. This app used to make that call
 * from seven different places, and the common ones stacked: `identifyUser` ran
 * on every request for log attribution, `requireAuth` ran again on every
 * guarded route, and `/api/diagram/chat` added a third via the quota actor.
 * Sentry recorded 442 `db findOne session` spans across 221 requests to
 * `GET /api/projects/:projectId/files` -- exactly two per request.
 *
 * Memoising on the request context rather than merely stashing a value means
 * the guarantee holds structurally: a caller that runs before this middleware,
 * or on a route where it never ran, still resolves exactly once because the
 * accessor below fills the same slot.
 */
export async function getRequestSession(c: Context): Promise<RequestSession | null> {
  const cached = c.get("session") as RequestSession | null | undefined;
  if (cached !== undefined) return cached;

  let session: RequestSession | null = null;
  try {
    // `returnHeaders` is not decoration. With `cookieCache` on, a cache miss
    // reads the database and then calls `setCookieCache` to write a refreshed
    // `session_data` cookie (better-auth `api/routes/session.mjs`, lines 214 and
    // 247). Those live in the endpoint's response headers, and the plain
    // `getSession({ headers })` form discards them -- so the cache would be read
    // but never rewritten, every request past the first `maxAge` would fall back
    // to a database read, and the cache would quietly do nothing. See
    // better-auth issue #3996. `returnHeaders` hands them back without the
    // double serialisation that `asResponse: true` costs.
    const { headers, response } = await auth.api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });

    // Reaching through `c.res` rather than calling `c.header()` is deliberate,
    // and is what Hono's own CORS middleware does. The `res` getter builds the
    // response object if it does not exist yet; that in turn is what makes the
    // `set res` merge path run when a handler returns a Response of its own,
    // and that path re-appends `set-cookie` entries individually instead of
    // flattening them. Writing to `c.header()` while no response exists would
    // park the cookie in `#preparedHeaders`, which a handler-built response --
    // every SSE route here -- never picks up.
    for (const cookie of headers.getSetCookie()) {
      c.res.headers.append("set-cookie", cookie);
    }

    session = response;
  } catch (error) {
    // `getSession` does not throw for "no session" -- that is a null return. So
    // reaching here means the lookup itself failed: the database is unreachable,
    // the pooler is out of connections, the query timed out. Swallowing that into
    // a bare `null` made an outage indistinguishable from a signed-out visitor,
    // which is the worst possible framing of it: every guarded route answers 401,
    // the web app treats that as "logged out" and bounces users to /login, and
    // because nothing was ever recorded, a site-wide forced logout produced not a
    // single Sentry event to explain it.
    //
    // Logging at error level routes it to Sentry through the drain in index.ts,
    // and the flag lets `requireAuth` answer 503 instead of 401 -- honest about
    // whose fault it is, and not a signal for the client to discard its session.
    c.get("log")?.error(error instanceof Error ? error : String(error), {
      auth: { stage: "resolve-session" },
    });
    c.set("sessionUnavailable", true);
    session = null;
  }

  c.set("session", session);
  return session;
}

/**
 * Resolve the session once and attribute the wide event from it.
 *
 * Replaces `createAuthMiddleware` from `evlog/better-auth`, which resolved a
 * session of its own purely to shape the log. This keeps that behaviour -- the
 * `auth.resolvedIn` / `auth.identified` fields and the masked-email whitelist
 * are the same -- but reuses the one resolution everything else reads.
 */
export const resolveSession = createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
  if (isAuthRoute(c.req.path)) return next();

  const log = c.get("log");
  const start = Date.now();
  const session = await getRequestSession(c);
  const resolvedIn = Date.now() - start;

  // `identifyUser` reports false when the session carries no usable user id,
  // which is not the same as having no session at all -- both leave the event
  // unattributed, so both report `identified: false`.
  const identified =
    session !== null &&
    identifyUser(
      log,
      session as unknown as { user: Record<string, unknown>; session: Record<string, unknown> },
      { maskEmail: true },
    );

  log.set({ auth: { resolvedIn, identified } });

  return next();
});
