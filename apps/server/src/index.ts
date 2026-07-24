import { auth } from "@OpenDiagram/auth";
import { env } from "@OpenDiagram/env/server";
import { sentry } from "@sentry/hono/bun";
import { initLogger } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { createFsDrain } from "evlog/fs";
import { evlog, type EvlogVariables } from "evlog/hono";
import { createSentryDrain } from "evlog/sentry";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { aiSettingsRoute } from "./routes/ai-settings";
import { diagramRoute } from "./routes/diagram";
import { githubImportRoute, githubRoute } from "./routes/github";
import { orchestrateRoute } from "./routes/orchestrate";
import { projectsRoute } from "./routes/projects";
import { usageRoute } from "./routes/usage";
import { waitlistRoute } from "./routes/waitlist";

initLogger({
  env: { service: "OpenDiagram-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

const origins = env.CORS_ORIGIN.split(",").map((o) => o.trim());

// Server-project DSN (public value). The Bun transport flushes asynchronously;
// on Cloud Run (CPU throttled after response) low-traffic events may lag until
// the next request or SIGTERM. Acceptable for now — revisit if events drop.
const SENTRY_DSN =
  "https://d065bd035ab8612f7d8527b0529c6742@o4511790063812608.ingest.us.sentry.io/4511790076592128";

const app = new Hono<EvlogVariables>();

// Sentry middleware must run as early as possible; it initializes the SDK.
app.use(
  sentry(app, {
    dsn: SENTRY_DSN,
    tracesSampleRate: env.NODE_ENV === "development" ? 1.0 : 0.1,
  }),
);

// All wide events go to local NDJSON files; only warn/error events also reach
// Sentry Logs, so we stay inside the free Logs allotment on Cloud Run traffic.
const fsDrain = createFsDrain();
const sentryDrain = createSentryDrain({ dsn: SENTRY_DSN });
app.use(
  evlog({
    drain: (ctx) => {
      fsDrain(ctx);
      if (ctx.event.level === "warn" || ctx.event.level === "error") {
        sentryDrain(ctx);
      }
    },
  }),
);

app.get("/", (c) => c.text("OK"));
app.get("/health", (c) => c.json({ status: "ok" }));

app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  await next();
});

app.use(
  "/*",
  cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-CreationQuota-Limit", "X-CreationQuota-Used", "X-CreationQuota-Remaining"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api/diagram", diagramRoute);
app.route("/api/orchestrate", orchestrateRoute);
app.route("/api/github", githubRoute);
app.route("/api/import", githubImportRoute);
app.route("/api/projects", projectsRoute);
app.route("/api/usage", usageRoute);
app.route("/api/waitlist", waitlistRoute);
app.route("/api/settings/ai", aiSettingsRoute);

export default {
  // Two slow paths share this: GitHub's OAuth token exchange (>10s on slow
  // networks) and the diagram agent's SSE stream, which can sit byte-idle for
  // 30s+ while Gemini generates a large tool call before anything flushes.
  idleTimeout: 120,
  fetch: app.fetch,
};
