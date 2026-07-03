import { db } from "@OpenDiagram/db";
import { project } from "@OpenDiagram/db/schema/project";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type AuthVariables, requireAuth } from "../lib/require-auth";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scene: z.unknown().optional(),
  spec: z.unknown().optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    scene: z.unknown().optional(),
    spec: z.unknown().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const projectsRoute = new Hono<{ Variables: AuthVariables }>();

projectsRoute.use("*", requireAuth);

// List current user's projects (metadata only -- no scene/spec payload).
projectsRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(eq(project.userId, userId))
    .orderBy(desc(project.updatedAt));
  return c.json({ projects: rows });
});

// Create -- the "save-on-login" endpoint for a guest draft.
projectsRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }
  const [row] = await db
    .insert(project)
    .values({ ...parsed.data, userId })
    .returning();
  return c.json({ project: row }, 201);
});

// Fetch one (full scene + spec), owner only.
projectsRoute.get("/:id", async (c) => {
  const userId = c.get("userId");
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId)));
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ project: row });
});

// Update name/description/scene/spec, owner only.
projectsRoute.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }
  const [row] = await db
    .update(project)
    .set(parsed.data)
    .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId)))
    .returning();
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ project: row });
});

// Delete, owner only.
projectsRoute.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const [row] = await db
    .delete(project)
    .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId)))
    .returning({ id: project.id });
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ ok: true });
});
