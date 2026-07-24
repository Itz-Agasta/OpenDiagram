import * as Sentry from "@sentry/nextjs";

// DSN is a public value (ships in the client bundle) — safe to hardcode.
Sentry.init({
  dsn: "https://211bc816992431e815a19fcf8775f16c@o4511790063812608.ingest.us.sentry.io/4511790124826624",
  // Errors + tracing only (no session replay). Full sampling in dev, 10% in prod.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

// Instrument client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
