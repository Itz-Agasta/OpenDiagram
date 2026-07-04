import { and, db, desc, eq } from "@OpenDiagram/db";
import { projectFile } from "@OpenDiagram/db/schema/project-file";
import { project } from "@OpenDiagram/db/schema/project";
import { Hono } from "hono";
import { z } from "zod";
import { generateGroundedProjectAnswer } from "../lib/llm";
import {
  ensureProjectKnowledgeDataset,
  getProjectCogneeStatus,
  reindexProjectKnowledge,
  searchProjectKnowledge,
} from "../lib/project-knowledge";
import { type AuthVariables, requireAuth } from "../lib/require-auth";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

const fileTypeSchema = z.enum(["diagram", "doc", "readme", "imported_repo", "ai_diagram"]);

const createFileSchema = z.object({
  name: z.string().min(1).max(200),
  type: fileTypeSchema,
  scene: z.unknown().optional(),
  spec: z.unknown().optional(),
  content: z.unknown().optional(),
  history: z.array(z.unknown()).optional(),
});

const updateFileSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    type: fileTypeSchema.optional(),
    scene: z.unknown().optional(),
    spec: z.unknown().optional(),
    content: z.unknown().optional(),
    history: z.array(z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
});

export const projectsRoute = new Hono<{ Variables: AuthVariables }>();

projectsRoute.use("*", requireAuth);

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

  if (!row) {
    return c.json({ error: "Could not create project" }, 500);
  }

  const cogneeDatasetId = await ensureProjectKnowledgeDataset({ projectId: row.id, userId });

  return c.json(
    { project: { ...row, cogneeDatasetId, cogneeStatus: cogneeDatasetId ? "pending" : "failed" } },
    201,
  );
});

projectsRoute.get("/:projectId/cognee/status", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const status = await getProjectCogneeStatus({ projectId, userId });

  if (!status) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ cognee: status });
});

projectsRoute.post("/:projectId/cognee/reindex", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");

  try {
    const status = await reindexProjectKnowledge({ projectId, userId });

    if (!status) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({ cognee: status });
  } catch {
    return c.json({ error: "Could not index project knowledge." }, 502);
  }
});

const contextQuerySchema = z.object({
  query: z.string().min(1).max(2000),
});

projectsRoute.post("/:projectId/cognee/context", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = contextQuerySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const results = await searchProjectKnowledge({
    projectId,
    userId,
    query: parsed.data.query,
  });

  if (!results) {
    return c.json({ error: "Not found" }, 404);
  }

  const context =
    results.length > 0 ? formatProjectContext(results) : "No matching project context found.";

  return c.json({
    context,
    sources: results.map((result) => ({
      id: result.document.id,
      title: result.document.title,
      sourceType: result.document.sourceType,
      excerpt: result.excerpt,
      score: result.score,
      metadata: result.document.metadata ?? {},
    })),
  });
});

projectsRoute.post("/:projectId/chat", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const results = await searchProjectKnowledge({
    projectId,
    userId,
    query: parsed.data.message,
  });

  if (!results) {
    return c.json({ error: "Not found" }, 404);
  }

  const context =
    results.length > 0 ? formatProjectContext(results) : "No matching project context.";
  const answer = await generateGroundedProjectAnswer({ message: parsed.data.message, context });

  return c.json({
    answer,
    sources: results.map((result) => ({
      id: result.document.id,
      title: result.document.title,
      sourceType: result.document.sourceType,
      excerpt: result.excerpt,
      score: result.score,
      metadata: result.document.metadata ?? {},
    })),
  });
});

projectsRoute.get("/:projectId/files", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const [projectRow] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)));

  if (!projectRow) {
    return c.json({ error: "Not found" }, 404);
  }

  const rows = await db
    .select({
      id: projectFile.id,
      projectId: projectFile.projectId,
      type: projectFile.type,
      name: projectFile.name,
      createdAt: projectFile.createdAt,
      updatedAt: projectFile.updatedAt,
    })
    .from(projectFile)
    .where(eq(projectFile.projectId, projectId))
    .orderBy(desc(projectFile.updatedAt));

  return c.json({ files: rows });
});

projectsRoute.post("/:projectId/files", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = createFileSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const [projectRow] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)));

  if (!projectRow) {
    return c.json({ error: "Not found" }, 404);
  }

  const [row] = await db
    .insert(projectFile)
    .values({ ...parsed.data, projectId })
    .returning();

  await markProjectKnowledgePending(projectId, userId);

  return c.json({ file: row }, 201);
});

projectsRoute.get("/:projectId/files/:fileId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const fileId = c.req.param("fileId");
  const [row] = await db
    .select({
      id: projectFile.id,
      projectId: projectFile.projectId,
      type: projectFile.type,
      name: projectFile.name,
      scene: projectFile.scene,
      spec: projectFile.spec,
      content: projectFile.content,
      history: projectFile.history,
      createdAt: projectFile.createdAt,
      updatedAt: projectFile.updatedAt,
    })
    .from(projectFile)
    .innerJoin(project, eq(projectFile.projectId, project.id))
    .where(and(eq(project.id, projectId), eq(project.userId, userId), eq(projectFile.id, fileId)));

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ file: row });
});

projectsRoute.patch("/:projectId/files/:fileId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const fileId = c.req.param("fileId");
  const body = await c.req.json().catch(() => null);
  const parsed = updateFileSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const [ownedFile] = await db
    .select({ id: projectFile.id })
    .from(projectFile)
    .innerJoin(project, eq(projectFile.projectId, project.id))
    .where(and(eq(project.id, projectId), eq(project.userId, userId), eq(projectFile.id, fileId)));

  if (!ownedFile) {
    return c.json({ error: "Not found" }, 404);
  }

  const [row] = await db
    .update(projectFile)
    .set(parsed.data)
    .where(eq(projectFile.id, fileId))
    .returning();

  await markProjectKnowledgePending(projectId, userId);

  return c.json({ file: row });
});

projectsRoute.delete("/:projectId/files/:fileId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const fileId = c.req.param("fileId");
  const [ownedFile] = await db
    .select({ id: projectFile.id })
    .from(projectFile)
    .innerJoin(project, eq(projectFile.projectId, project.id))
    .where(and(eq(project.id, projectId), eq(project.userId, userId), eq(projectFile.id, fileId)));

  if (!ownedFile) {
    return c.json({ error: "Not found" }, 404);
  }

  await db.delete(projectFile).where(eq(projectFile.id, fileId));
  await markProjectKnowledgePending(projectId, userId);

  return c.json({ ok: true });
});

function formatProjectContext(
  results: NonNullable<Awaited<ReturnType<typeof searchProjectKnowledge>>>,
) {
  return results
    .map(
      (result, index) =>
        `Source ${index + 1}: ${result.document.title}\nType: ${result.document.sourceType}\nExcerpt: ${result.excerpt}`,
    )
    .join("\n\n");
}

async function markProjectKnowledgePending(projectId: string, userId: string) {
  await db
    .update(project)
    .set({ cogneeStatus: "pending", cogneeError: null })
    .where(and(eq(project.id, projectId), eq(project.userId, userId)));
}

projectsRoute.get("/:id", async (c) => {
  const userId = c.get("userId");
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId)));

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  await markProjectKnowledgePending(row.id, userId);

  return c.json({ project: row });
});

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
