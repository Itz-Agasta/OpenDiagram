import { createDb } from "@OpenDiagram/db";
import * as schema from "@OpenDiagram/db/schema/auth";
import { env } from "@OpenDiagram/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

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
    },
    // Stateless OAuth state: keep the whole state payload in one encrypted,
    // short-lived cookie instead of the DB. Avoids "verification not found"
    // from flaky pooler writes / `bun --hot` reloads mid-flow.
    account: {
      storeStateStrategy: "cookie",
      accountLinking: {
        enabled: true,
        trustedProviders: ["github"],
        allowDifferentEmails: true,
      },
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
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export const auth = createAuth();
