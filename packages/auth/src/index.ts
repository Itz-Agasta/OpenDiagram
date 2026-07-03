import { createDb } from "@OpenDiagram/db";
import * as schema from "@OpenDiagram/db/schema/auth";
import { env } from "@OpenDiagram/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

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
    trustedOrigins: [env.CORS_ORIGIN],
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
