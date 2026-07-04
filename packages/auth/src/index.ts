import { createDb } from "@OpenDiagram/db";
import * as schema from "@OpenDiagram/db/schema/auth";
import { env } from "@OpenDiagram/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

// TODO: Replace with Redis-backed secondary storage before deploying to production.
// The current in-memory Map does not survive across server instances or cold starts,
// which will break OAuth flows and rate limiting in horizontally scaled deployments.
// See https://www.better-auth.com/docs/advanced/secondary-storage
const secondaryStorage = createMemorySecondaryStorage();

export function createAuth() {
  const db = createDb();
  const githubProvider =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            scopes: ["user:email", "repo"],
          },
        }
      : undefined;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    secondaryStorage,
    session: {
      storeSessionInDatabase: true,
    },
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: githubProvider,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
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

function createMemorySecondaryStorage() {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  function sweep() {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  }

  function read(key: string) {
    const entry = store.get(key);

    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }

    return entry.value;
  }

  return {
    async get(key: string) {
      return read(key);
    },
    async set(key: string, value: string, ttl?: number) {
      store.set(key, {
        value,
        expiresAt: ttl ? Date.now() + ttl * 1000 : null,
      });

      if (!sweepTimer) {
        sweepTimer = setInterval(sweep, 60_000);
        if (typeof sweepTimer === "object" && "unref" in sweepTimer) {
          sweepTimer.unref();
        }
      }
    },
    async delete(key: string) {
      store.delete(key);
    },
    async getAndDelete(key: string) {
      const value = read(key);
      store.delete(key);
      return value;
    },
  };
}
