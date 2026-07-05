import { and, db, desc, eq } from "@OpenDiagram/db";
import { projectFile } from "@OpenDiagram/db/schema/project-file";
import { project } from "@OpenDiagram/db/schema/project";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { generateGroundedProjectAnswer } from "../lib/repo-ai";
import {
  getProjectMemoryContext,
  getProjectMemoryStatus,
  markProjectMemoryPending,
  reindexProjectMemory,
} from "../lib/project-memory";
import {
  getRepoGenerationJob,
  runRepoGenerationWithEmitter,
  startRepoGeneration,
  type RepoGenerationJob,
} from "../lib/repo-generation";
import { type AuthVariables, requireAuth } from "../lib/require-auth";
import { createLogger } from "evlog";

const log = createLogger({ module: "projects" });

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  source: z.enum(["manual", "github_import"]).optional(),
  sourceMetadata: z.unknown().optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

const fileTypeSchema = z.enum(["diagram", "doc"]);

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

const contextQuerySchema = z.object({
  query: z.string().min(1).max(2000),
});

function markProjectMemoryPendingSafely(projectId: string, userId: string) {
  void markProjectMemoryPending(projectId, userId).catch((error) => {
    log.error("Failed to mark project memory pending", { error });
  });
}

function markDocSpecUserEdited(spec: unknown) {
  if (!spec || typeof spec !== "object" || !("kind" in spec)) return spec;
  if ((spec as { kind?: unknown }).kind !== "repo_documentation") return spec;

  return { ...(spec as Record<string, unknown>), userEditedAt: new Date().toISOString() };
}

export const projectsRoute = new Hono<{ Variables: AuthVariables }>();

projectsRoute.use("*", requireAuth);

projectsRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      source: project.source,
      sourceMetadata: project.sourceMetadata,
      generationStatus: project.generationStatus,
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

  return c.json({ project: row }, 201);
});

projectsRoute.get("/:projectId/memory/status", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const status = await getProjectMemoryStatus({ projectId, userId });

  if (!status) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ memory: status });
});

projectsRoute.post("/:projectId/memory/reindex", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");

  try {
    const status = await reindexProjectMemory({ projectId, userId });

    if (!status) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({ memory: status });
  } catch {
    return c.json({ error: "Could not index project memory." }, 502);
  }
});

projectsRoute.post("/:projectId/memory/context", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = contextQuerySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const context = await getProjectMemoryContext({
    projectId,
    userId,
    query: parsed.data.query,
  });

  if (!context) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(context);
});

projectsRoute.post("/:projectId/chat", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const projectContext = await getProjectMemoryContext({
    projectId,
    userId,
    query: parsed.data.message,
  });

  if (!projectContext) {
    return c.json({ error: "Not found" }, 404);
  }

  const answer = await generateGroundedProjectAnswer({
    message: parsed.data.message,
    context: projectContext.context,
  });

  return c.json({
    answer,
    sources: projectContext.sources,
    provider: projectContext.provider,
  });
});

projectsRoute.post("/:projectId/repo-generation", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");

  let started: Awaited<ReturnType<typeof startRepoGeneration>>;
  try {
    started = await startRepoGeneration({ projectId, userId });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Could not start repository generation." },
      400,
    );
  }
  if (!started) return c.json({ error: "Not found" }, 404);
  const startedResult = started;

  // Stream generation progress inside the request so the work keeps its CPU
  // allocation on Cloud Run scale-to-zero (see routes/github.ts import stream).
  return streamSSE(c, async (stream) => {
    const send = (job: RepoGenerationJob) =>
      stream.writeSSE({ event: "status", data: JSON.stringify(job) });
    await send(startedResult.job);
    // Swallow write errors on a closed stream (client disconnect) so a rejected
    // writeSSE promise can't become an unhandled rejection.
    await runRepoGenerationWithEmitter(startedResult, (job) => {
      send(job).catch(() => {});
    });
  });
});

projectsRoute.get("/:projectId/repo-generation/:jobId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const jobId = c.req.param("jobId");
  const job = await getRepoGenerationJob({ projectId, userId, jobId });

  if (!job) return c.json({ error: "Repository generation job not found." }, 404);

  return c.json({ job });
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

  markProjectMemoryPendingSafely(projectId, userId);

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
    .select({ id: projectFile.id, spec: projectFile.spec, type: projectFile.type })
    .from(projectFile)
    .innerJoin(project, eq(projectFile.projectId, project.id))
    .where(and(eq(project.id, projectId), eq(project.userId, userId), eq(projectFile.id, fileId)));

  if (!ownedFile) {
    return c.json({ error: "Not found" }, 404);
  }

  const update = {
    ...parsed.data,
    spec:
      ownedFile.type === "doc" && "content" in parsed.data
        ? markDocSpecUserEdited(ownedFile.spec)
        : parsed.data.spec,
  };

  const [row] = await db
    .update(projectFile)
    .set(update)
    .where(eq(projectFile.id, fileId))
    .returning();

  markProjectMemoryPendingSafely(projectId, userId);

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
  markProjectMemoryPendingSafely(projectId, userId);

  return c.json({ ok: true });
});

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

  markProjectMemoryPendingSafely(c.req.param("id"), userId);

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
