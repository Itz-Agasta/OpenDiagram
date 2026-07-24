import * as Sentry from "@sentry/nextjs";
import { WEB_SENTRY_DSN } from "./sentry.dsn";

Sentry.init({
  dsn: WEB_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
