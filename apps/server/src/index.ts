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
import { projectsRoute } from "./routes/projects";

initLogger({
  env: { service: "OpenDiagram-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

const app = new Hono<EvlogVariables>();

app.use(evlog({ drain: createFsDrain() }));
app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  await next();
});

app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api/diagram", diagramRoute);
app.route("/api/github", githubRoute);
app.route("/api/import", githubImportRoute);
app.route("/api/projects", projectsRoute);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
