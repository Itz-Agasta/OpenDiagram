/**
 * Better Auth server config.
 *
 * Options reference: https://better-auth.com/docs/reference/options
 * Perf guide:        https://better-auth.com/docs/guides/optimizing-for-performance
 */
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

function withCallback(url: string, callbackURL: string): string {
  const link = new URL(url);
  link.searchParams.set("callbackURL", callbackURL);
  return link.toString();
}

/**
 * Read the credit count out of the plan table instead of hardcoding it in the
 * mail copy. The launch grant drops from 25 to 15 after two months, and an email
 * advertising a stale number is worse than one advertising none.
 */
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
    // Uses the shared `db` from `@OpenDiagram/db`, never a `createDb()` of our
    // own: each call builds its own pg.Pool, so a second one here would give
    // every Cloud Run instance two pools against the same Supavisor pooler and
    // halve how many instances fit under the connection ceiling.
    //
    // `transaction` defaults to false, which leaves multi-step writes (sign-up =
    // user + account + session) running as separate statements with no rollback.
    // A failure between them strands a user row that can never be signed into or
    // re-registered, since the email is unique.
    // https://better-auth.com/docs/adapters/drizzle
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
      transaction: true,
    }),
    // Lets the Drizzle adapter satisfy `findSession`'s user join in one query
    // instead of two (session, then user). Without it the adapter factory falls
    // back to a second round trip per session lookup. Requires the Drizzle
    // relations in schema/auth - measured 2 statements -> 1 against our own DB.
    //
    // TODO: Still marked experimental upstream, so re-check on every version bump.
    experimental: { joins: true },
    trustedOrigins: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    session: {
      // The sign-in form offers "Keep me signed in for 30 days", and `rememberMe`
      // takes the cookie's max age from this value - the 7-day default quietly
      // delivered a quarter of what the checkbox promised. Unchecked still means
      // a browser-session cookie; this only sets the remembered length.
      expiresIn: 60 * 60 * 24 * 30,
      // Without the cache every getSession hits the database. With it, a signed
      // cookie answers most reads.
      //
      // 60s rather than the 5 minutes the docs suggest, because
      // `revokeSessionsOnPasswordReset` below is load-bearing: a cached cookie
      // keeps a revoked session alive on other devices until it expires, and the
      // person being locked out is assumed hostile. A minute is also nearly all
      // of the win - the dashboard fires eleven requests inside one second, so
      // one DB read per minute per user already collapses ~95% of session traffic.
      //
      // `jwe` encrypts the payload; the default `compact` only signs it, leaving
      // the user's email and name readable to anything that can see the cookie.
      //
      // Escape hatches: `disableCookieCache: true` on a single getSession forces
      // a fresh read, and bumping `cookieCache.version` invalidates every cached
      // cookie at once.
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
    // Verification is a soft gate, not a sign-in wall. `requireEmailVerification`
    // would lock out every account that predates this, and the quota resolver
    // already does the useful half by holding unverified accounts on the guest
    // allowance - so signup still works, it just isn't worth farming.
    //
    // No `sendOnSignIn`: in 1.6.22 that branch sits inside the
    // `requireEmailVerification` guard (api/routes/sign-in.mjs), so with the flag
    // unset it never fires and only looks like a recovery path. The real one is
    // the "resend" control in the web app calling `authClient.sendVerificationEmail`.
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
          url: withCallback(url, `${webOrigin()}/dashboard?verified=1`),
        });
      },
      // Welcome lands after verification, not at signup: two mails racing in the
      // inbox buries the one that actually unlocks the account.
      afterEmailVerification: async (user) => {
        await sendWelcomeMail({
          to: user.email,
          name: user.name,
          dashboardUrl: `${webOrigin()}/dashboard`,
          credits: await signupCredits(),
        });
      },
    },
    // On by default in production, with stricter built-in rules on the sensitive
    // routes. `database` rather than the default in-process memory because Cloud
    // Run runs several instances and scales to zero - a memory counter is both
    // per-instance and wiped by every cold start, which for an idling service is
    // most of the time.
    // https://better-auth.com/docs/concepts/rate-limit
    rateLimit: {
      storage: "database",
      customRules: {
        // Exempt because `storage: "database"` costs a read plus a write on every
        // /api/auth/** call, and /get-session is the busiest one - apps/web/src
        // /proxy.ts hits it on every matched navigation. Metered, it spends those
        // trips on the exact endpoint the session cookie cache exists to make free.
        //
        // Safe because it mutates nothing and reveals nothing: without a valid
        // cookie it returns null. The brute-forceable routes (/sign-in*, /sign-up*,
        // /change-password, /change-email) keep Better Auth's built-in limits,
        // which this map would have to name explicitly to override.
        "/get-session": false,
      },
    },
    // https://better-auth.com/docs/concepts/oauth
    account: {
      // Keep the OAuth state in one encrypted short-lived cookie instead of the
      // DB. Avoids "verification not found" from flaky pooler writes or a
      // `bun --hot` reload mid-flow.
      storeStateStrategy: "cookie",
      // We keep GitHub access tokens and spend them during repo import, so they
      // are live credentials at rest, not a login artefact. AES-256-GCM under
      // BETTER_AUTH_SECRET. Safe to switch on with rows already stored: reads
      // fall through to the raw value when it isn't ciphertext.
      encryptOAuthTokens: true,
    },
    socialProviders: githubProvider,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      // Deliberately no `backgroundTasks.handler`. Better Auth passes the mail
      // callbacks through `runInBackgroundOrAwait`, which awaits them only while
      // no handler is set - and Cloud Run has no `waitUntil` equivalent, so a
      // handler here would detach the send into a CPU-throttled instance. See
      // packages/auth/src/email for why that loses the mail.
      ipAddress: {
        /**
         * Better Auth trusts a forwarded header only when it carries a single
         * value, unless proxies are named. Naming them switches resolution to
         * walking the chain right to left and taking the first hop that isn't
         * trusted - everything to its left was supplied by the caller.
         *
         * This list looks inert and isn't. Prod (Cloud Run domain mapping, no
         * load balancer) sends a single-value X-Forwarded-For - every
         * `session.ip_address` row is a real public address, none null - so on a
         * normal request both modes agree. It earns its keep on the abnormal one:
         * a caller may send an X-Forwarded-For of its own, and Cloud Run appends
         * the address it observed rather than replacing the header. Measured:
         *
         *   header                    named proxies   unnamed
         *   "203.0.113.9"             203.0.113.9     203.0.113.9
         *   "1.2.3.4, 203.0.113.9"    203.0.113.9     null
         *
         * Unnamed, that second row is a denial of service. An unresolved IP does
         * not disable rate limiting, it buckets everyone under
         * `no-trusted-ip|<path>` - so junk headers from one client exhaust the
         * shared bucket and the built-in 3-sign-ins-per-10s becomes a limit on the
         * whole deployment. Named, the spoofed hop is ignored and the attacker
         * gets their own bucket.
         *
         * Only ranges that can never be a public client are listed, so a real
         * address is never mistaken for a hop. That also means this list does not
         * cover a CDN: put Cloudflare in front of the API and X-Forwarded-For
         * becomes `<client>, <edge>` with a public edge address, which would be
         * returned as the client IP and silently collapse every caller onto one
         * bucket. Cloudflare's published ranges have to be added here at the same
         * time as the proxy - and apps/server/src/lib/quota/actor.ts updated to
         * match, since it counts hops from the right without consulting this list.
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
      // In prod, web and server are different hosts under one registrable domain,
      // so the session cookie is scoped to the shared parent via COOKIE_DOMAIN.
      // That is also what lets apps/web/src/proxy.ts read the cookie at the apex
      // and forward it to the API; a host-only cookie would be invisible to it.
      // https://better-auth.com/docs/concepts/cookies
      ...(env.COOKIE_DOMAIN
        ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } }
        : {}),
      defaultCookieAttributes: {
        // Lax everywhere, and in production that is a security fix rather than a
        // convenience. This was `none`, which tells the browser to attach session
        // cookies to any site's request - and `hono/cors` only decides which
        // response headers to set, it never rejects a request. So an attacker's
        // page could fire a no-preflight "simple" POST (Content-Type: text/plain,
        // which c.req.json() parses anyway) carrying the victim's cookies. Better
        // Auth's own origin check is registered on its router alone, so it guarded
        // /api/auth/** and none of this app's routes. Worst case was
        // POST /api/settings/ai/providers, an onConflictDoUpdate on
        // (userId, provider): a silent swap of the victim's BYOK key for the
        // attacker's.
        //
        // Lax closes the class because it is scoped by site (registrable domain),
        // not origin: our hosted web and server are the same site,
        // so our own cross-origin fetches still carry the cookie while any
        // other site's no longer do. This is the pairing Better Auth's Hono guide
        // recommends - subdomains plus crossSubDomainCookies - over the
        // `sameSite: "none"` it documents for genuinely cross-site deployments.
        // https://better-auth.com/docs/integrations/hono
        //
        // So CORS_ORIGIN must stay same-site. A truly cross-site origin (a
        // *.vercel.app preview, or a frontend moved off this domain) would
        // silently stop receiving the session cookie under Lax; that needs its own
        // answer, not a downgrade back to `none`.
        //
        // Local dev keeps Lax and additionally cannot use `secure`: it runs over
        // HTTP on localhost, where the browser rejects Secure cookies and OAuth
        // state cannot round-trip.
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export const auth = createAuth();
