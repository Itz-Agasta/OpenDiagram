// Public Sentry DSN for the web project. It ships in the client bundle, so it is
// not a secret. Single source of truth: the three Sentry runtime configs and the
// evlog drain all import from here, so rotating the DSN is a one-line change.
export const WEB_SENTRY_DSN =
  "https://211bc816992431e815a19fcf8775f16c@o4511790063812608.ingest.us.sentry.io/4511790124826624";
