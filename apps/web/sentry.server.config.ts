import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://211bc816992431e815a19fcf8775f16c@o4511790063812608.ingest.us.sentry.io/4511790124826624",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
