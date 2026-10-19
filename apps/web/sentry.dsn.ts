import { env } from "@OpenDiagram/env/web";

// Web project DSN. Unset means no reporting. It still ships in the client bundle,
// so it is public; env-only so a clone of the repo doesn't report into our project.
// Single source of truth for the three Sentry runtime configs and the evlog drain.
export const WEB_SENTRY_DSN = env.NEXT_PUBLIC_SENTRY_DSN;

// Tunable without a code change; defaults to 1 when the env var is unset.
export const WEB_SENTRY_TRACES_SAMPLE_RATE = env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE;

// Left to itself the Next.js SDK reports Vercel deploys as "vercel-production",
// while the Cloud Run server reports "production" — the same deploy would sit
// under two different environment names and no single filter would match both.
// NEXT_PUBLIC_VERCEL_ENV is set by Vercel at build and runtime ("production" |
// "preview" | "development") and, being NEXT_PUBLIC_, is inlined into the
// browser bundle too, so client and server agree. Falls back to NODE_ENV
// locally, where Vercel's variables are absent.
export const WEB_SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV;

// Every category explicit: in Sentry v11 an unset one means "collect" (cookies,
// request bodies, user IP). This is the v10 default plus no local variables, shared
// by all three runtimes. `code`/`state` are OAuth callback params; `token` is already
// on Sentry's built-in sensitive-key list.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v10-to-v11/#data-collection
const denyNetworkIdentity = { deny: ["forwarded", "-ip", "remote-", "via", "-user"] };
export const WEB_SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: denyNetworkIdentity, response: denyNetworkIdentity },
  httpBodies: [],
  urlQueryParams: { deny: [...denyNetworkIdentity.deny, "code", "state"] },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  graphQL: { document: false, variables: false },
  queues: false,
  stackFrameVariables: false,
} satisfies NonNullable<Parameters<typeof import("@sentry/nextjs").init>[0]>["dataCollection"];
