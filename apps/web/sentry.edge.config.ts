import * as Sentry from "@sentry/nextjs";
import { WEB_SENTRY_DSN, WEB_SENTRY_TRACES_SAMPLE_RATE } from "./sentry.dsn";

Sentry.init({
  dsn: WEB_SENTRY_DSN,
  // The client and server SDKs fall back to NODE_ENV on their own; the edge one
  // only reads SENTRY_ENVIRONMENT, so without this it defaults to "production".
  environment: process.env.NODE_ENV,
  tracesSampleRate: WEB_SENTRY_TRACES_SAMPLE_RATE,
});
