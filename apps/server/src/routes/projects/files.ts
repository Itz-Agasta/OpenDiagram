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

/** The columns a file list returns -- never the large ones in `project_file_content`. */
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

  // Driven from `project` with a left join rather than selecting files directly,
  // so a single round trip still separates the two failure modes: no rows means
  // the project is missing or not this user's (404), while one row with a null
  // file means the project is real and merely empty ([]). Selecting straight
  // from `project_file` would answer both with an empty list, and this route is
  // the most-called in the app -- the ownership pre-check it replaces was a
  // second sequential round trip on every canvas and dashboard load.
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

  // TODO: 5 round trips -- this select, then BEGIN/INSERT/INSERT/COMMIT.
  // Measured at ~1.5s against us-east-2. Collapsible to 1 with a CTE that does
  // ownership, file insert and content insert together. Left for a later
  // session: the route runs a few times a month, and folding the check into
  // `INSERT ... SELECT ... WHERE EXISTS` would blur "not found" into
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
  // `project_file_content`. Left-joined: a missing content row reads as an empty
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

  // `?fields=meta` drops the content echo from the response. The write paths that
  // use it -- canvas autosave, the agent's spec write, the chat history write --
  // are all replication behind a local write and read nothing back, yet each was
  // downloading the scene it had just uploaded. A rename paid 12.8KB to change 15
  // bytes. Opt-in rather than the default because `useWorkspaceFileActions` and
  // `useWorkspaceFileName` do `setActiveFile(updated)` and read `updated.content`,
  // so stripping it unconditionally would blank the editor.
  const metaOnly = c.req.query("fields") === "meta";

  // TODO: still 4 round trips -- BEGIN, UPDATE, content upsert, COMMIT. A single
  // CTE would be atomic without the explicit transaction, so 1. Needs either
  // dynamically built SQL or a `CASE WHEN $flag` per content column, since the
  // columns are written conditionally. Measured against us-east-2 at 285ms per
  // round trip from India, ~18ms once the DB is co-located with Cloud Run.
  const row = await db.transaction(async (tx) => {
    // Ownership rides on the UPDATE instead of a select in front of it: no row
    // back means the file is missing or the project isn't this user's. `type`
    // comes back with it for the doc stamp below.
    //
    // `updatedAt` is set explicitly rather than left to `$onUpdate` because the
    // canvas PATCH usually carries `scene` alone -- `metadata` is then `{}`, and
    // drizzle rejects an update with no columns to set. It is always written,
    // even for a content-only change, since it drives the dashboard ordering.
    const [file] = await tx
      .update(projectFile)
      .set({ ...metadata, updatedAt: new Date() })
      .from(project)
      .where(
        and(
          eq(projectFile.id, fileId),
          eq(projectFile.projectId, projectId),
          eq(project.id, projectId),
          eq(project.userId, userId),
        ),
      )
      .returning(fileListColumns);

    if (!file) return null;

    // Editing a doc's body stamps the spec so the generator knows a human has
    // touched it. Read here rather than in the ownership select it replaced:
    // `spec` is a TOASTed column and every canvas autosave was paying to fetch
    // one it never looked at. Keyed on the value, not `"content" in parsed.data`
    // -- an optional Zod field can arrive as an explicit `undefined`, which key
    // presence would read as an edit.
    let nextSpec = spec;
    if (file.type === "doc" && content !== undefined) {
      const [existing] = await tx
        .select({ spec: projectFileContent.spec })
        .from(projectFileContent)
        .where(eq(projectFileContent.fileId, fileId));
      nextSpec = markDocSpecUserEdited(existing?.spec ?? null);
    }

    const contentRow = await writeProjectFileContent(
      tx,
      fileId,
      { scene, spec: nextSpec, content, history },
      { returnContent: !metaOnly },
    );

    return { ...file, ...contentRow };
  });

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  // `withContentDefaults` normalises a missing content row to `history: []`, which
  // is exactly the wrong thing for a meta response -- it would tell the client the
  // chat history is empty when it simply was not asked for.
  return c.json({ file: metaOnly ? row : withContentDefaults(row) });
});

filesRoute.delete("/:projectId/files/:fileId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const fileId = c.req.param("fileId");

  // The content row goes with it via the cascade on `file_id`.
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
