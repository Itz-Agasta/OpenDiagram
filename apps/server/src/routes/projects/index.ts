import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../../lib/require-auth";
import { chatRoute } from "./chat";
import { filesRoute } from "./files";
import { projectRoute } from "./project";
import { repoGenerationRoute } from "./repo-generation";

export const projectsRoute = new Hono<{ Variables: AuthVariables }>();

// Registered before the sub-routers so it runs ahead of every handler they add.
projectsRoute.use("*", requireAuth);

// `projectRoute` last: its `/:id` handlers would otherwise shadow nothing, but
// keeping the catch-all shape at the bottom is the order that stays correct if
// someone adds a one-segment path to another file.
projectsRoute.route("/", filesRoute);
projectsRoute.route("/", chatRoute);
projectsRoute.route("/", repoGenerationRoute);
projectsRoute.route("/", projectRoute);
