import * as Sentry from "@sentry/nextjs";
import {
  WEB_SENTRY_DSN,
  WEB_SENTRY_ENVIRONMENT,
  WEB_SENTRY_TRACES_SAMPLE_RATE,
} from "./sentry.dsn";

Sentry.init({
  dsn: WEB_SENTRY_DSN,
  environment: WEB_SENTRY_ENVIRONMENT,
  // Errors + tracing only (no session replay).
  tracesSampleRate: WEB_SENTRY_TRACES_SAMPLE_RATE,
});

// Instrument client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
