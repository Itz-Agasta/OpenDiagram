import { env } from "@OpenDiagram/env/web";

// Public Sentry DSN for the web project. It ships in the client bundle, so it is
// not a secret. Single source of truth: the three Sentry runtime configs and the
// evlog drain all import from here, so rotating the DSN is a one-line change.
export const WEB_SENTRY_DSN =
  "https://211bc816992431e815a19fcf8775f16c@o4511790063812608.ingest.us.sentry.io/4511790124826624";

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
