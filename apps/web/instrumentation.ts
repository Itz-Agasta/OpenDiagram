import * as Sentry from "@sentry/nextjs";
import { defineNodeInstrumentation } from "evlog/next/instrumentation";

const evlogInstrumentation = defineNodeInstrumentation(() => import("./src/lib/evlog"));

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
  await evlogInstrumentation.register();
}

// Next.js allows a single onRequestError export — fan it out to both Sentry
// (error tracking) and evlog (structured wide-event logging).
export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  Sentry.captureRequestError(...args);
  // evlog's handler may be async; surface its failures instead of swallowing
  // them, but never let a logging error escape as an unhandled rejection.
  void Promise.resolve(
    evlogInstrumentation.onRequestError(
      ...(args as Parameters<typeof evlogInstrumentation.onRequestError>),
    ),
  ).catch((err) => {
    console.error("[instrumentation] evlog onRequestError failed", err);
  });
};
