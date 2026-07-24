import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";
import { createSentryDrain } from "evlog/sentry";
import { WEB_SENTRY_DSN } from "../../sentry.dsn";

// The web app runs on serverless (Vercel) with an ephemeral, read-only FS, so
// there is no local FS drain here (unlike the Bun server). evlog still emits
// every event to stdout, which the platform captures. On top of that, only
// warn/error wide events are forwarded to Sentry Logs — this keeps us inside the
// free Logs allotment while routine info/debug logs stay in the platform's log
// stream.
const sentryDrain = createSentryDrain({ dsn: WEB_SENTRY_DSN });

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: "OpenDiagram-web",
  drain: (ctx) => {
    if (ctx.event.level === "warn" || ctx.event.level === "error") {
      // Fire-and-forget: never block the response on log delivery. Defer the
      // call into the chain so both synchronous throws and async rejections are
      // caught and can't surface as an unhandled rejection.
      void Promise.resolve()
        .then(() => sentryDrain(ctx))
        .catch(() => {});
    }
  },
});

export const { register, onRequestError } = createInstrumentation({
  service: "OpenDiagram-web",
});
