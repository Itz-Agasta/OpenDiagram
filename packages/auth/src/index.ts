import { db, eq } from "@OpenDiagram/db";
import * as schema from "@OpenDiagram/db/schema/auth";
import { plan } from "@OpenDiagram/db/schema/billing";
import { env } from "@OpenDiagram/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sendPasswordResetMail, sendVerificationMail, sendWelcomeMail } from "./email";

/** First entry of CORS_ORIGIN - the web app, which owns every user-facing page. */
function webOrigin(): string {
  return env.CORS_ORIGIN.split(",")[0]?.trim() ?? env.BETTER_AUTH_URL;
}

function withCallback(url: string, defaultCallbackURL: string): string {
  const link = new URL(url);
  const originalCallback = link.searchParams.get("callbackURL");
  if (originalCallback) {
    try {
      const parsed = new URL(originalCallback);
      const allowed = env.CORS_ORIGIN.split(",").map((o) => o.trim());
      if (allowed.includes(parsed.origin)) {
        const callbackWithVerified = new URL(originalCallback);
        callbackWithVerified.searchParams.set("verified", "1");
        link.searchParams.set("callbackURL", callbackWithVerified.toString());
        return link.toString();
      }
    } catch {}
  }
  link.searchParams.set("callbackURL", defaultCallbackURL);
  return link.toString();
}

/** Read credits from the plan table, not hardcoded -- the grant changes over time. */
async function signupCredits(): Promise<number> {
  const [row] = await db
    .select({ signupGrant: plan.signupGrant, monthlyCredits: plan.monthlyCredits })
    .from(plan)
    .where(eq(plan.id, "free"))
    .limit(1);
  return row ? row.signupGrant || row.monthlyCredits : 0;
}

export function createAuth() {
  const githubProvider =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            scopes: ["read:user", "user:email"],
          },
        }
      : undefined;

  return betterAuth({
    // Shared `db`, not a second `createDb()` -- each call makes its own pg.Pool,
    // and two pools per Cloud Run instance halves capacity under Supavisor.
    // `transaction: true` wraps sign-up (user + account + session) in a rollback.
    // https://better-auth.com/docs/adapters/drizzle
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
      transaction: true,
    }),
    // Joins session + user in one query instead of two. Measured 2 statements -> 1.
    // TODO: re-check on every Better Auth version bump -- still experimental upstream.
    experimental: { joins: true },
    trustedOrigins: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    session: {
      // 30-day remembered session. The 7-day default silently delivered a quarter
      // of what the checkbox promised.
      expiresIn: 60 * 60 * 24 * 30,
      // 60s cache (not 5min) because revokeSessionsOnPasswordReset is load-bearing:
      // a cached cookie keeps a revoked session alive until expiry. 60s also covers
      // ~95% of dashboard reads (11 requests in <1s). `jwe` encrypts the payload.
      // https://better-auth.com/docs/concepts/session-management
      cookieCache: { enabled: true, maxAge: 60, strategy: "jwe" },
    },
    // https://better-auth.com/docs/authentication/email-password
    emailAndPassword: {
      enabled: true,
      // Off by default, and wrong for a recovery flow: people reset a password
      // because somebody else has it, so leaving that somebody's session alive
      // means the reset changes nothing for them.
      revokeSessionsOnPasswordReset: true,
      // The landing page comes from the caller's `redirectTo`, so Better Auth
      // builds this link correctly without a rewrite here.
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetMail({ to: user.email, name: user.name, url });
      },
    },
    // Soft gate, not a wall. `requireEmailVerification` would lock out pre-existing
    // accounts. No `sendOnSignIn`: in 1.6.22 it sits inside the requireEmailVerification
    // guard, so it never fires when the flag is unset.
    // https://better-auth.com/docs/concepts/email
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationMail({
          to: user.email,
          name: user.name,
          // Better Auth builds the link against the API origin and defaults its
          // callbackURL to "/", which lands the user on the bare API host.
          url: withCallback(url, `${webOrigin()}/app?verified=1`),
        });
      },
      // Welcome lands after verification, not at signup: two mails racing in the
      // inbox buries the one that actually unlocks the account.
      afterEmailVerification: async (user) => {
        await sendWelcomeMail({
          to: user.email,
          name: user.name,
          dashboardUrl: `${webOrigin()}/app`,
          credits: await signupCredits(),
        });
      },
    },
    // `storage: "database"` because Cloud Run scales to zero -- in-memory counters
    // are per-instance and wiped by every cold start.
    // https://better-auth.com/docs/concepts/rate-limit
    rateLimit: {
      storage: "database",
      customRules: {
        // /get-session is the busiest auth route (hit every navigation). The cookie
        // cache already makes it free; metering it would spend a DB read+write for
        // nothing -- it returns null without a valid cookie, so it's safe to exempt.
        "/get-session": false,
      },
    },
    // https://better-auth.com/docs/concepts/oauth
    account: {
      // Cookie-backed OAuth state avoids "verification not found" from pooler writes
      // or a `bun --hot` reload mid-flow.
      storeStateStrategy: "cookie",
      // GitHub tokens are live credentials (used during repo import), so encrypt
      // at rest with AES-256-GCM under BETTER_AUTH_SECRET.
      encryptOAuthTokens: true,
    },
    socialProviders: githubProvider,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      // No `backgroundTasks.handler` -- Cloud Run has no `waitUntil`, so a handler
      // would detach mail sends into a CPU-throttled instance and lose them.
      ipAddress: {
        /**
         * Named proxies so Cloud Run's appended hop is ignored instead of
         * bucketing every caller together. Measured:
         *   header                    named proxies   unnamed
         *   "203.0.113.9"             203.0.113.9     203.0.113.9
         *   "1.2.3.4, 203.0.113.9"    203.0.113.9     null
         *
         * Only RFC 1918 ranges. A CDN would need its ranges added here and in
         * actor.ts at the same time as the proxy.
         */
        trustedProxies: [
          "127.0.0.0/8",
          "::1/128",
          "10.0.0.0/8",
          "172.16.0.0/12",
          "192.168.0.0/16",
          "fc00::/7",
        ],
      },
      // COOKIE_DOMAIN scopes the session cookie to the shared parent so proxy.ts
      // at the apex can read and forward it.
      // https://better-auth.com/docs/concepts/cookies
      ...(env.COOKIE_DOMAIN
        ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } }
        : {}),
      defaultCookieAttributes: {
        // Lax, not `none`: `none` let any site's no-preflight POST ride the session
        // cookie. Our web and API are same-site, so our own cross-origin fetches
        // still work. CORS_ORIGIN must stay same-site.
        // https://better-auth.com/docs/integrations/hono
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export const auth = createAuth();
