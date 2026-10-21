import * as Sentry from "@sentry/nextjs";
import {
  WEB_SENTRY_DATA_COLLECTION,
  WEB_SENTRY_DSN,
  WEB_SENTRY_ENVIRONMENT,
  WEB_SENTRY_TRACES_SAMPLE_RATE,
} from "./sentry.dsn";

Sentry.init({
  dsn: WEB_SENTRY_DSN,
  environment: WEB_SENTRY_ENVIRONMENT,
  dataCollection: WEB_SENTRY_DATA_COLLECTION,
  tracesSampleRate: WEB_SENTRY_TRACES_SAMPLE_RATE,
});
