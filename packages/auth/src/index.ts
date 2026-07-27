import { createDb, eq } from "@OpenDiagram/db";
import * as schema from "@OpenDiagram/db/schema/auth";
import { plan } from "@OpenDiagram/db/schema/plan";
import { env } from "@OpenDiagram/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sendPasswordResetMail, sendVerificationMail, sendWelcomeMail } from "./email";

/** First entry of CORS_ORIGIN — the web app, which owns every user-facing page. */
function webOrigin(): string {
  return env.CORS_ORIGIN.split(",")[0]?.trim() ?? env.BETTER_AUTH_URL;
}

function withCallback(url: string, callbackURL: string): string {
  const link = new URL(url);
  link.searchParams.set("callbackURL", callbackURL);
  return link.toString();
}

/**
 * What the welcome mail promises, read from the plan table rather than written
 * into the copy. Credit counts are data (the launch grant drops from 25 to 15
 * after two months), and an email that advertises a stale number is worse than
 * one that advertises none.
 */
async function signupCredits(db: ReturnType<typeof createDb>): Promise<number> {
  const [row] = await db
    .select({ signupGrant: plan.signupGrant, monthlyCredits: plan.monthlyCredits })
    .from(plan)
    .where(eq(plan.id, "free"))
    .limit(1);
  return row ? row.signupGrant || row.monthlyCredits : 0;
}

export function createAuth() {
  const db = createDb();
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
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    session: {
      // The sign-in form offers "Keep me signed in for 30 days", and `rememberMe`
      // sets the cookie's max age from this value -- so the 7-day default quietly
      // delivered a quarter of what the checkbox promised. Unchecked still means a
      // browser-session cookie; this only sets the remembered length.
      //
      // `storeSessionInDatabase` used to be set here and did nothing: it only
      // applies when `secondaryStorage` is configured, and without one, sessions
      // are already in the database.
      expiresIn: 60 * 60 * 24 * 30,
    },
    emailAndPassword: {
      enabled: true,
      // Off by default, and wrong for a recovery flow: the reason someone resets a
      // password is usually that somebody else has it, and leaving that somebody's
      // session alive means the reset changes nothing for them.
      revokeSessionsOnPasswordReset: true,
      // The reset link's landing page is chosen by the caller via `redirectTo`,
      // so better-auth builds it correctly without a rewrite here.
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetMail({ to: user.email, name: user.name, url });
      },
    },
    // Verification is a soft gate, not a sign-in wall: `requireEmailVerification`
    // would lock out every account that predates this, and the quota resolver
    // already does the useful half by holding an unverified account on the guest
    // allowance until it verifies. So signup still works, it just isn't worth
    // farming. `sendOnSignIn` gives someone who lost the first mail a way to get
    // another without a resend button.
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationMail({
          to: user.email,
          name: user.name,
          // better-auth builds the link against the API origin and defaults its
          // callbackURL to "/", which would land the user on the bare API host.
          // Point it at the web app instead.
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
          credits: await signupCredits(db),
        });
      },
    },
    // Enabled in production by default, with stricter built-in rules on the
    // sensitive routes. `database` rather than the default in-process memory:
    // Cloud Run runs several instances and scales to zero, so a memory counter is
    // both per-instance and wiped by every cold start -- for a service that idles,
    // that is most of the time, and the sign-in brute-force limit lapses with it.
    rateLimit: {
      storage: "database",
    },
    // Stateless OAuth state: keep the whole state payload in one encrypted,
    // short-lived cookie instead of the DB. Avoids "verification not found"
    // from flaky pooler writes / `bun --hot` reloads mid-flow.
    account: {
      storeStateStrategy: "cookie",
      // We keep GitHub access tokens and spend them on the user's behalf during
      // repo import, so they are live credentials at rest, not a login artefact.
      // AES-256-GCM under BETTER_AUTH_SECRET. Safe to switch on with rows already
      // stored: reads fall through to the raw value when it isn't ciphertext, so
      // existing tokens keep working and get encrypted as they are refreshed.
      encryptOAuthTokens: true,
    },
    socialProviders: githubProvider,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      // Deliberately no `backgroundTasks.handler`. Better Auth passes the mail
      // callbacks through `runInBackgroundOrAwait`, which awaits them only while
      // no handler is set -- and Cloud Run has no `waitUntil` equivalent, so a
      // handler here would detach the send into an instance whose CPU is already
      // throttled. See packages/auth/src/email for why that loses the mail.
      ipAddress: {
        /**
         * Better Auth trusts a forwarded header only when it carries a single
         * value, unless proxies are named. Cloud Run appends the address it
         * observed, so ours routinely carries two -- and an unresolved IP does not
         * disable rate limiting, it collapses every caller onto one shared
         * `no-trusted-ip|<path>` bucket. That turns the built-in defaults (3
         * sign-ins per 10s, 3 password resets per 60s) into limits on the whole
         * deployment: the fourth user inside the window gets a 429.
         *
         * Naming proxies switches resolution to walking the chain right to left,
         * which is the same rightmost-hop rule `hashClientIp` uses in the quota
         * system, and for the same reason: everything left of the address our
         * platform appended was supplied by the caller.
         *
         * Only ranges that can never be a public client are listed, so a real
         * address is never mistaken for a hop. They exist to select that mode and
         * to step over a Google-internal address if one is ever appended.
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
      // In prod, web (app.vyse.site) and server (api.vyse.site) are different
      // subdomains, so the session cookie must be scoped to the shared parent
      // domain or the browser treats it as third-party and drops it.
      ...(env.COOKIE_DOMAIN
        ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } }
        : {}),
      defaultCookieAttributes: {
        // Local development runs over HTTP on localhost, so Secure cookies
        // are rejected by the browser and OAuth state cannot round-trip.
        // Production uses HTTPS across app/api subdomains and needs None.
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",
        secure: env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export const auth = createAuth();
