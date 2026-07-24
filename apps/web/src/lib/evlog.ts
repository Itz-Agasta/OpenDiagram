import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";
import { createSentryDrain } from "evlog/sentry";

// Only warn/error wide events reach Sentry Logs — keeps us inside the free Logs
// allotment. Routine request logs live in the local FS drain instead.
const sentryDrain = createSentryDrain({
  dsn: "https://211bc816992431e815a19fcf8775f16c@o4511790063812608.ingest.us.sentry.io/4511790124826624",
});

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: "OpenDiagram-web",
  drain: (ctx) => {
    if (ctx.event.level === "warn" || ctx.event.level === "error") {
      sentryDrain(ctx);
    }
  },
});

export const { register, onRequestError } = createInstrumentation({
  service: "OpenDiagram-web",
});
