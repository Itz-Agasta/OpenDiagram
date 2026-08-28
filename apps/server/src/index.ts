import { auth } from "@OpenDiagram/auth";
import { env } from "@OpenDiagram/env/server";
import { sentry } from "@sentry/hono/bun";
import { initLogger } from "evlog";
import { createFsDrain } from "evlog/fs";
import { evlog } from "evlog/hono";
import { createSentryDrain } from "evlog/sentry";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolveSession, type SessionVariables } from "./lib/session";
// Registers the AI SDK's OpenTelemetry integration; must load before any AI call.
import "./lib/telemetry";
import { aiSettingsRoute } from "./routes/ai-settings";
import { billingRoute } from "./routes/billing";
import { diagramRoute } from "./routes/diagram";
import { githubImportRoute, githubRoute } from "./routes/github";
import { projectsRoute } from "./routes/projects";
import { usageRoute } from "./routes/usage";
import { dodoWebhookRoute } from "./routes/webhooks/dodo";

initLogger({
  env: { service: "OpenDiagram-server" },
  // Explicit, though evlog already defaults this to on in production and the
  // Dockerfile does set NODE_ENV=production. The billing path logs a customer
  // email (lib/dodo/subscription-sync.ts), and those events reach Sentry, so
  // whether that address is masked should not rest on an ENV line in a
  // Dockerfile that a future deploy target may not reproduce.
  redact: true,
});

const origins = env.CORS_ORIGIN.split(",").map((o) => o.trim());

// Server-project DSN (public value). The Bun transport flushes asynchronously;
// on Cloud Run (CPU throttled after response) low-traffic events may lag until
// the next request or SIGTERM. Acceptable for now — revisit if events drop.
const SENTRY_DSN =
  "https://d065bd035ab8612f7d8527b0529c6742@o4511790063812608.ingest.us.sentry.io/4511790076592128";

const app = new Hono<{ Variables: SessionVariables }>();

// The middleware is the SDK's only init, and it runs after the imports above have
// already pulled in `pg` (@OpenDiagram/auth -> @OpenDiagram/db) -- too late to
// instrument it. `@sentry/node/preload` wraps modules first, so the run scripts
// and the Dockerfile pass `--preload`; without that flag every `db` span vanishes.
// It patches `require`, so `pg` has to stay external to the bundle to be seen.
// https://docs.sentry.io/platforms/javascript/guides/hono/install/late-initialization/
app.use(
  sentry(app, {
    dsn: SENTRY_DSN,
    // Without this the SDK falls back to "production", so local dev traffic
    // lands in the same bucket as Cloud Run and every env filter is useless.
    // Release is picked up automatically from SENTRY_RELEASE when deploys set it.
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Send spans as they finish instead of buffering until the root span ends.
    // /api/diagram/chat is a long-lived SSE response, so in transaction mode its
    // spans are lost whenever the process restarts mid-stream.
    traceLifecycle: "stream",
    // Keep the model/token/latency metadata, drop the content — user prompts
    // and repo context must not leave the server.
    dataCollection: { genAI: { inputs: false, outputs: false } },
    // VercelAI is inert on Bun (see lib/telemetry.ts); @ai-sdk/otel emits the
    // gen_ai spans instead. Drop it so the two never produce duplicate spans
    // if Sentry later adds Bun support for the diagnostics channel.
    integrations: (defaults) => defaults.filter((i) => i.name !== "VercelAI"),
  }),
);

// All wide events go to local NDJSON files; only warn/error events also reach
// Sentry Logs, so we stay inside the free Logs allotment on Cloud Run traffic.
// The drain is intentionally fire-and-forget (evlog's contract) so it never adds
// latency to the response. Note: actual exceptions are captured separately and
// synchronously by the Sentry middleware above, which flushes on its own — this
// log drain is supplementary, so a dropped log on a Cloud Run freeze never loses
// the error itself. Rejections are swallowed to avoid unhandled rejections.
const fsDrain = createFsDrain();
const sentryDrain = createSentryDrain({ dsn: SENTRY_DSN, environment: env.NODE_ENV });
app.use(
  evlog({
    drain: (ctx) => {
      fsDrain(ctx);
      // On status too, not just level. evlog 2.22.4 does not derive level from the
      // response: 404, 500, and even a route that throws all arrive here at `info`,
      // so the level gate on its own forwarded no failed request at all. Verified
      // against `evlog/hono` directly, because the opposite is easy to assume.
      const status = ctx.event.status;
      const failed = typeof status === "number" && status >= 500;
      if (ctx.event.level === "warn" || ctx.event.level === "error" || failed) {
        // Defer into the chain so a synchronous throw is caught too, rather
        // than escaping as an uncaught error.
        void Promise.resolve()
          .then(() => sentryDrain(ctx))
          .catch(() => {});
      }
    },
  }),
);

app.get("/", (c) => c.text("OK"));
app.get("/health", (c) => c.json({ status: "ok" }));

// Ahead of `resolveSession` deliberately: cors answers a preflight with 204 and
// never calls next(), so an OPTIONS stops resolving a session it cannot use.
// `maxAge` because every PATCH was buying its own preflight -- 8 of them in one
// drawing session against a single file. Chrome caps the value at 7200s anyway.
app.use(
  "/*",
  cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-CreationQuota-Limit", "X-CreationQuota-Used", "X-CreationQuota-Remaining"],
    credentials: true,
    maxAge: 86400,
  }),
);

// Resolves the Better Auth session once and attributes the wide event from it.
// Everything downstream -- `requireAuth`, the quota actor, the BYOK lookup in
// /api/diagram/chat -- reads that same result via `getRequestSession`, so a
// request costs one session resolution rather than the two or three it used to.
app.use("*", resolveSession);

// Hono's default handler answers 500 and discards the error, leaving the wide
// event a bare status with nothing to debug. Logging through the request's own
// logger attaches it to that event, which the drain above forwards to Sentry.
app.onError((error, c) => {
  c.get("log")?.error(error);
  // `use-dashboard-data.ts` string-matches this exact `error` value for its toast.
  return c.json({ error: "Internal Server Error" }, 500);
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api/diagram", diagramRoute);
app.route("/api/github", githubRoute);
app.route("/api/import", githubImportRoute);
app.route("/api/projects", projectsRoute);
app.route("/api/usage", usageRoute);
app.route("/api/settings/ai", aiSettingsRoute);
app.route("/api/billing", billingRoute);
// Server-to-server, signature-verified, no session. The registered Dodo endpoint
// points at this exact path.
app.route("/api/webhooks/dodo", dodoWebhookRoute);

export default {
  // Two slow paths share this: GitHub's OAuth token exchange (>10s on slow
  // networks) and the diagram agent's SSE stream, which can sit byte-idle for
  // 30s+ while Gemini generates a large tool call before anything flushes.
  idleTimeout: 120,
  fetch: app.fetch,
};
