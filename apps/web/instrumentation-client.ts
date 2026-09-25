import { env } from "@OpenDiagram/env/web";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import {
  WEB_SENTRY_DSN,
  WEB_SENTRY_ENVIRONMENT,
  WEB_SENTRY_TRACES_SAMPLE_RATE,
} from "./sentry.dsn";

// Unset keys = no analytics, like Umami: local dev and forks stay out of the stats.
// `/relay` is the ad-blocker proxy in next.config.ts.
if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: "/relay",
    ui_host: env.NEXT_PUBLIC_POSTHOG_HOST.replace(".i.posthog.com", ".posthog.com"),
    defaults: "2026-08-30",
    // Errors are Sentry's; set in code so the project toggle can't double-report them.
    capture_exceptions: false,
    // Sends this visitor's PostHog id to our API so a guest's AI traces join the
    // same person as their pageviews. The API must allow these headers in CORS.
    tracing_headers: [new URL(env.NEXT_PUBLIC_SERVER_URL).hostname],
  });
}

Sentry.init({
  dsn: WEB_SENTRY_DSN,
  environment: WEB_SENTRY_ENVIRONMENT,
  // Errors + tracing only (no session replay).
  tracesSampleRate: WEB_SENTRY_TRACES_SAMPLE_RATE,
});

// Instrument client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
