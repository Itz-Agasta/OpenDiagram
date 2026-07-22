/** Composes authenticated BYOK settings routes and enforces origin checks for every mutation. */
import { env } from "@OpenDiagram/env/server";
import { Hono } from "hono";
import { type AuthVariables, requireAuth } from "../lib/require-auth";
import { aiSettingsRoutes } from "./ai-settings/routes";

const trustedOrigins = new Set(
  env.CORS_ORIGIN.split(",").map((origin) => new URL(origin.trim()).origin),
);

export const aiSettingsRoute = new Hono<{ Variables: AuthVariables }>();

aiSettingsRoute.use("*", requireAuth);
aiSettingsRoute.use("*", async (context, next) => {
  const origin = context.req.header("Origin");
  if (context.req.method !== "GET" && origin) {
    let normalizedOrigin: string;
    try {
      normalizedOrigin = new URL(origin).origin;
    } catch {
      return context.json({ error: "Invalid request origin" }, 403);
    }
    if (!trustedOrigins.has(normalizedOrigin)) {
      return context.json({ error: "Request origin is not allowed" }, 403);
    }
  }

  await next();
  context.header("Cache-Control", "no-store");
});

aiSettingsRoute.route("/", aiSettingsRoutes);
