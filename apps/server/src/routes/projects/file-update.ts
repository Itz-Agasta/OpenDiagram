import { and, db, eq } from "@OpenDiagram/db";
import { project, projectFile, projectFileContent } from "@OpenDiagram/db/schema/projects";
import { Hono } from "hono";
import { z } from "zod";
import { projectFileContentJoin, withContentDefaults } from "../../lib/project-file-content";
import { writeProjectFile } from "../../lib/project-file-write";
import type { AuthVariables } from "../../lib/require-auth";
import {
  isSceneDelta,
  mergeSceneDelta,
  pruneTombstones,
  sceneDeltaSchema,
} from "../../lib/scene-delta";
import {
  deleteObject,
  isMissingObject,
  loadScene,
  settleScene,
  uploadScene,
} from "../../lib/scene-store";
import { fileTypeSchema } from "./files";

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

function markDocSpecUserEdited(spec: unknown) {
  if (!spec || typeof spec !== "object" || !("kind" in spec)) return spec;
  if ((spec as { kind?: unknown }).kind !== "repo_documentation") return spec;

  return { ...(spec as Record<string, unknown>), userEditedAt: new Date().toISOString() };
}

export const fileUpdateRoute = new Hono<{ Variables: AuthVariables }>();

/**
 * The canvas save, and the busiest route in the app.
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
fileUpdateRoute.patch("/:projectId/files/:fileId", async (c) => {
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
      .select({
        scene: projectFileContent.scene,
        sceneKey: projectFileContent.sceneKey,
        sceneRev: projectFileContent.sceneRev,
      })
      .from(projectFile)
      .innerJoin(project, eq(projectFile.projectId, project.id))
      .leftJoin(projectFileContent, projectFileContentJoin)
      .where(
        and(eq(project.id, projectId), eq(project.userId, userId), eq(projectFile.id, fileId)),
      );

    if (!current) return c.json({ error: "Not found" }, 404);
    // A null base is the unload beacon, which cannot wait to learn the current
    // revision, so it merges onto whatever the row holds. A base that is still
    // null after that is a file with no content row: the changed elements are a
    // fragment, and inserting them would stand in for a whole scene.
    const base = delta.data.base ?? current.sceneRev;
    if (base === null || (current.sceneRev ?? 0) !== base) {
      return c.json({ error: "Stale scene revision" }, 409);
    }

    let currentScene: unknown;
    try {
      currentScene = await loadScene({ scene: current.scene, sceneKey: current.sceneKey });
    } catch (error) {
      if (!isMissingObject(error)) throw error;
      // A save committed and retired this object after the row read above, so
      // the revision has moved: the ordinary stale answer, and the client
      // resends a whole scene.
      return c.json({ error: "Stale scene revision" }, 409);
    }
    nextScene = mergeSceneDelta(currentScene, delta.data);
    // Re-checked inside the write as well. This comparison is against a snapshot
    // that another request can invalidate before the write lands; the guard on the
    // statement itself is what actually makes it safe.
    expectedSceneRev = base;
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

  const prunedScene = pruneTombstones(nextScene);
  const uploaded =
    prunedScene === undefined
      ? null
      : await uploadScene({ userId, projectId }, fileId, prunedScene);

  const result = await writeProjectFile({
    projectId,
    fileId,
    userId,
    metadata,
    content: { spec: nextSpec, content, history },
    sceneKey: uploaded?.key,
    expectedSceneRev,
    returnContent: !metaOnly,
  }).catch(async (error: unknown) => {
    const cleanup = uploaded ? await deleteObject(uploaded.key) : null;
    if (cleanup)
      c.get("log").set({ scene: { orphan: uploaded?.key, deleteError: String(cleanup) } });
    throw error;
  });

  if (uploaded) {
    const committed = result.status === "ok";
    const deleteError = await settleScene(
      uploaded.key,
      committed,
      committed ? result.previousSceneKey : null,
    );
    c.get("log").set({
      scene: {
        store: "s3",
        delta: delta?.success === true,
        gzBytes: uploaded.gzBytes,
        putMs: uploaded.putMs,
        committed,
        ...(deleteError ? { deleteError: String(deleteError) } : {}),
      },
    });
  }

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
  if (metaOnly || !result.content) return c.json({ file: row });
  // The row's scene column is NULL once the scene lives in storage, so the echo
  // is the scene just written, or the stored one when this write did not touch it.
  const echoed = prunedScene !== undefined ? prunedScene : await loadScene(result.content);
  const { sceneKey: _key, ...echoedContent } = result.content;
  return c.json({ file: withContentDefaults({ ...row, ...echoedContent, scene: echoed }) });
});
