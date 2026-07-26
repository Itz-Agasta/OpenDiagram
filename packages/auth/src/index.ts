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
      storeSessionInDatabase: true,
    },
    emailAndPassword: {
      enabled: true,
      // The reset link's landing page is chosen by the caller via `redirectTo`,
      // so better-auth builds it correctly without a rewrite here.
      sendResetPassword: async ({ user, url }) => {
        sendPasswordResetMail({ to: user.email, name: user.name, url });
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
        sendVerificationMail({
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
        sendWelcomeMail({
          to: user.email,
          name: user.name,
          dashboardUrl: `${webOrigin()}/dashboard`,
          credits: await signupCredits(db),
        });
      },
    },
    // Stateless OAuth state: keep the whole state payload in one encrypted,
    // short-lived cookie instead of the DB. Avoids "verification not found"
    // from flaky pooler writes / `bun --hot` reloads mid-flow.
    account: {
      storeStateStrategy: "cookie",
    },
    socialProviders: githubProvider,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
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
