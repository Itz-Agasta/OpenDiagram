import * as Sentry from "@sentry/nextjs";
import { WEB_SENTRY_DSN } from "./sentry.dsn";

Sentry.init({
  dsn: WEB_SENTRY_DSN,
  // Errors + tracing only (no session replay). Full sampling in dev, 10% in prod.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

// Instrument client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
