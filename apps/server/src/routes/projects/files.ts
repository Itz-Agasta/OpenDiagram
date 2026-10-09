import { and, db, desc, eq, exists } from "@OpenDiagram/db";
import { project, projectFile, projectFileContent } from "@OpenDiagram/db/schema/projects";
import { Hono } from "hono";
import { z } from "zod";
import {
  projectFileContentJoin,
  selectProjectFileColumns,
  withContentDefaults,
  writeProjectFileContent,
} from "../../lib/project-file-content";
import type { AuthVariables } from "../../lib/require-auth";
import { pruneTombstones } from "../../lib/scene-delta";
import {
  deleteObject,
  deletePrefix,
  filePrefix,
  isMissingObject,
  loadScene,
  uploadScene,
} from "../../lib/scene-store";

export const fileTypeSchema = z.enum(["diagram", "doc"]);

const createFileSchema = z.object({
  name: z.string().min(1).max(200),
  type: fileTypeSchema,
  scene: z.unknown().optional(),
  spec: z.unknown().optional(),
  content: z.unknown().optional(),
  history: z.array(z.unknown()).optional(),
});

/** The columns a file list returns; never the large ones in project_file_content. */
const fileListColumns = {
  id: projectFile.id,
  projectId: projectFile.projectId,
  type: projectFile.type,
  name: projectFile.name,
  createdAt: projectFile.createdAt,
  updatedAt: projectFile.updatedAt,
};

/** Ownership as a subquery, for statements that can't join. */
function ownedProject(projectId: string, userId: string) {
  return exists(
    db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.userId, userId))),
  );
}

export const filesRoute = new Hono<{ Variables: AuthVariables }>();

filesRoute.get("/:projectId/files", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");

  // Driven from project with a left join rather than selecting files directly,
  // so a single round trip still separates the two failure modes: no rows means
  // the project is missing or not this user's (404), while one row with a null
  // file means the project is real and merely empty ([]). Selecting straight
  // from project_file would answer both with an empty list, and this route is the
  // most-called in the app (the ownership pre-check it replaces was a second
  // sequential round trip on every canvas and dashboard load).
  const rows = await db
    .select({ file: fileListColumns })
    .from(project)
    .leftJoin(projectFile, eq(projectFile.projectId, project.id))
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .orderBy(desc(projectFile.updatedAt));

  if (rows.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ files: rows.flatMap((row) => (row.file ? [row.file] : [])) });
});

filesRoute.post("/:projectId/files", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = createFileSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  // TODO: 5 round trips (this select, then BEGIN/INSERT/INSERT/COMMIT).
  // Measured at ~1.5s against us-east-2. Collapsible to 1 with a CTE that does
  // ownership, file insert and content insert together. Left for a later
  // session: the route runs a few times a month, and folding the check into
  // INSERT ... SELECT ... WHERE EXISTS would blur "not found" into
  // "insert failed".
  const [projectRow] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)));

  if (!projectRow) {
    return c.json({ error: "Not found" }, 404);
  }

  const { scene, spec, content, history, ...metadata } = parsed.data;
  // Guest draft promotion posts a scene drawn before the account existed, so
  // this path receives tombstones as old as the draft in localStorage.
  const initialScene = pruneTombstones(scene);
  // The id is minted here rather than by the insert default because the scene's
  // object key needs it, and the upload has to finish before the transaction opens.
  const fileId = crypto.randomUUID();
  const uploaded =
    initialScene === undefined
      ? null
      : await uploadScene({ userId, projectId }, fileId, initialScene);

  // Two rows now, so one transaction: a file whose content row failed to insert
  // would open blank and silently discard whatever the client sent with it.
  const row = await db
    .transaction(async (tx) => {
      const [file] = await tx
        .insert(projectFile)
        .values({ ...metadata, id: fileId, projectId })
        .returning();

      if (!file) throw new Error("Could not create file");

      const written = await writeProjectFileContent(tx, file.id, {
        sceneKey: uploaded?.key,
        spec,
        content,
        history,
      });

      return { ...file, ...written.content, scene: initialScene ?? null };
    })
    .catch(async (error: unknown) => {
      const cleanup = uploaded ? await deleteObject(uploaded.key) : null;
      if (cleanup)
        c.get("log").set({ scene: { orphan: uploaded?.key, deleteError: String(cleanup) } });
      throw error;
    });

  return c.json({ file: row }, 201);
});

filesRoute.get("/:projectId/files/:fileId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const fileId = c.req.param("fileId");
  // The one route that wants the large columns, so the only one that joins to
  // project_file_content. Left-joined: a missing content row reads as an empty
  // file rather than a 404 on a file the list just showed.
  const readRow = async () => {
    const [found] = await db
      .select(selectProjectFileColumns())
      .from(projectFile)
      .innerJoin(project, eq(projectFile.projectId, project.id))
      .leftJoin(projectFileContent, projectFileContentJoin)
      .where(
        and(eq(project.id, projectId), eq(project.userId, userId), eq(projectFile.id, fileId)),
      );
    return found;
  };

  let row = await readRow();
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  const started = performance.now();
  let scene: unknown;
  try {
    scene = await loadScene(row);
  } catch (error) {
    if (!isMissingObject(error)) throw error;
    // A save retired this object between the row read and the fetch. Once is
    // enough: the row now names the newer object, and its sceneRev goes back
    // with it so the client's delta baseline matches the scene it gets.
    row = await readRow();
    if (!row) return c.json({ error: "Not found" }, 404);
    scene = await loadScene(row);
  }
  c.get("log").set({
    scene: {
      store: row.sceneKey ? "s3" : "jsonb",
      readMs: Math.round(performance.now() - started),
    },
  });

  return c.json({ file: withContentDefaults({ ...row, scene }) });
});

/**
 * Delete from the workspace explorer or the dashboard tree. Ownership rides in
 * the statement rather than a preceding SELECT, so a file cannot be removed
 * between the check and the delete. 404 also answers another user's file.
 */
filesRoute.delete("/:projectId/files/:fileId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const fileId = c.req.param("fileId");

  // The content row goes with it via the cascade on file_id.
  const [row] = await db
    .delete(projectFile)
    .where(
      and(
        eq(projectFile.id, fileId),
        eq(projectFile.projectId, projectId),
        ownedProject(projectId, userId),
      ),
    )
    .returning({ id: projectFile.id });

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  // After the row, never before: a failed row delete must leave its scene. A
  // failed prefix delete only leaves storage to sweep, so it is logged, not a 500.
  const removed = await deletePrefix(filePrefix({ userId, projectId }, fileId)).catch(
    (error: unknown) => String(error),
  );
  c.get("log").set({ scene: { prefixDelete: removed } });

  return c.json({ ok: true });
});
