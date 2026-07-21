import { auth } from "@OpenDiagram/auth";
import { env } from "@OpenDiagram/env/server";
import { initLogger } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { createFsDrain } from "evlog/fs";
import { evlog, type EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
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

const app = new Hono<EvlogVariables>();

app.use(evlog({ drain: createFsDrain() }));

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

export default {
  // Two slow paths share this: GitHub's OAuth token exchange (>10s on slow
  // networks) and the diagram agent's SSE stream, which can sit byte-idle for
  // 30s+ while Gemini generates a large tool call before anything flushes.
  idleTimeout: 120,
  fetch: app.fetch,
};
