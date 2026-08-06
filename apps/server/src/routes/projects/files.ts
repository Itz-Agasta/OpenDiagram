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
import { writeProjectFile } from "../../lib/project-file-write";
import type { AuthVariables } from "../../lib/require-auth";
import { isSceneDelta, mergeSceneDelta, sceneDeltaSchema } from "../../lib/scene-delta";

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

/** The columns a file list returns; never the large ones in project_file_content. */
const fileListColumns = {
  id: projectFile.id,
  projectId: projectFile.projectId,
  type: projectFile.type,
  name: projectFile.name,
  createdAt: projectFile.createdAt,
  updatedAt: projectFile.updatedAt,
};

function markDocSpecUserEdited(spec: unknown) {
  if (!spec || typeof spec !== "object" || !("kind" in spec)) return spec;
  if ((spec as { kind?: unknown }).kind !== "repo_documentation") return spec;

  return { ...(spec as Record<string, unknown>), userEditedAt: new Date().toISOString() };
}

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

  // Two rows now, so one transaction: a file whose content row failed to insert
  // would open blank and silently discard whatever the client sent with it.
  const { scene, spec, content, history, ...metadata } = parsed.data;
  const row = await db.transaction(async (tx) => {
    const [file] = await tx
      .insert(projectFile)
      .values({ ...metadata, projectId })
      .returning();

    if (!file) throw new Error("Could not create file");

    const contentRow = await writeProjectFileContent(tx, file.id, {
      scene,
      spec,
      content,
      history,
    });

    return { ...file, ...contentRow };
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
  const [row] = await db
    .select(selectProjectFileColumns())
    .from(projectFile)
    .innerJoin(project, eq(projectFile.projectId, project.id))
    .leftJoin(projectFileContent, projectFileContentJoin)
    .where(and(eq(project.id, projectId), eq(project.userId, userId), eq(projectFile.id, fileId)));

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ file: withContentDefaults(row) });
});

/**
 * The only writer of project_file_content, and the busiest route in the app.
 *
 * scene arrives in one of two shapes: a whole scene, or a delta of the elements
 * whose Excalidraw version moved since base (see lib/scene-delta.ts). A delta
 * answers 409 when base is not the current revision, which is the client's cue
 * to drop its baseline and resend a whole scene (no body worth reading comes
 * back with it).
 *
 * Last-writer-wins throughout, matching the local-first canvas. The response
 * carries sceneRev whenever the content row was touched.
 */
filesRoute.patch("/:projectId/files/:fileId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const fileId = c.req.param("fileId");
  const body = await c.req.json().catch(() => null);
  const parsed = updateFileSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const { scene, spec, content, history, ...metadata } = parsed.data;

  // ?fields=meta drops the content echo from the response. The write paths that
  // use it (canvas autosave, agent spec write, chat history write) are all
  // replication behind a local write and read nothing back, yet each was
  // downloading the scene it had just uploaded. A rename paid 12.8KB to change 15
  // bytes. Opt-in rather than default because useWorkspaceFileActions and
  // useWorkspaceFileName do setActiveFile(updated) and read updated.content, so
  // stripping it unconditionally would blank the editor.
  const metaOnly = c.req.query("fields") === "meta";

  const delta = isSceneDelta(scene) ? sceneDeltaSchema.safeParse(scene) : null;
  if (delta && !delta.success) {
    return c.json({ error: "Invalid scene delta", issues: delta.error.issues }, 400);
  }

  // The only two writes that have to see the current row before building the next
  // one. Everything else (the overwhelming majority of traffic) goes straight to
  // the single-statement write below.
  let nextScene = scene;
  let nextSpec = spec;
  let expectedSceneRev: number | undefined;

  if (delta?.success) {
    const [current] = await db
      .select({ scene: projectFileContent.scene, sceneRev: projectFileContent.sceneRev })
      .from(projectFile)
      .innerJoin(project, eq(projectFile.projectId, project.id))
      .leftJoin(projectFileContent, projectFileContentJoin)
      .where(
        and(eq(project.id, projectId), eq(project.userId, userId), eq(projectFile.id, fileId)),
      );

    if (!current) return c.json({ error: "Not found" }, 404);
    if ((current.sceneRev ?? 0) !== delta.data.base) {
      return c.json({ error: "Stale scene revision" }, 409);
    }

    nextScene = mergeSceneDelta(current.scene, delta.data);
    // Re-checked inside the write as well. This comparison is against a snapshot
    // that another request can invalidate before the write lands; the guard on the
    // statement itself is what actually makes it safe.
    expectedSceneRev = delta.data.base;
  } else if (content !== undefined) {
    // Editing a doc's body stamps the spec so the generator knows a human touched
    // it. Keyed on the value, not "content" in parsed.data (an optional Zod field
    // can arrive as explicit undefined, which key presence would read as an edit).
    // spec is TOASTed, so this read is kept off every canvas autosave.
    const [current] = await db
      .select({ type: projectFile.type, spec: projectFileContent.spec })
      .from(projectFile)
      .innerJoin(project, eq(projectFile.projectId, project.id))
      .leftJoin(projectFileContent, projectFileContentJoin)
      .where(
        and(eq(project.id, projectId), eq(project.userId, userId), eq(projectFile.id, fileId)),
      );

    if (!current) return c.json({ error: "Not found" }, 404);
    // The type after this write, not before it. A request that converts a diagram
    // to a doc and supplies the body in one go still owes the spec its stamp.
    if ((metadata.type ?? current.type) === "doc") {
      nextSpec = markDocSpecUserEdited(current.spec ?? null);
    }
  }

  const result = await writeProjectFile({
    projectId,
    fileId,
    userId,
    metadata,
    content: { scene: nextScene, spec: nextSpec, content, history },
    expectedSceneRev,
    returnContent: !metaOnly,
  });

  if (result.status === "not-found") return c.json({ error: "Not found" }, 404);
  // Empty body on purpose: the client answers a 409 by resending the whole scene,
  // so returning the current one would cost the 70 kB this endpoint exists to
  // avoid. Note the write already advanced updatedAt even though the scene did not
  // land, since both are sub-statements of one statement. See project-file-write.
  if (result.status === "stale") return c.json({ error: "Stale scene revision" }, 409);

  const row = { ...result.file, sceneRev: result.sceneRev };

  // withContentDefaults normalises a missing content row to history: [], which is
  // exactly the wrong thing for a meta response (it would tell the client chat
  // history is empty when it simply was not asked for).
  return c.json({ file: metaOnly ? row : withContentDefaults({ ...row, ...result.content }) });
});

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

  return c.json({ ok: true });
});
