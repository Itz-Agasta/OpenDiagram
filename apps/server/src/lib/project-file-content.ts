import { db, eq, sql } from "@OpenDiagram/db";
import { projectFile, projectFileContent } from "@OpenDiagram/db/schema/projects";

/** Either the pooled db or an open transaction; both satisfy these calls. */
type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The large columns, living in project_file_content, not project_file. */
export type ProjectFileContentPatch = {
  /** Object storage key of a scene the caller already uploaded. */
  sceneKey?: string;
  spec?: unknown;
  content?: unknown;
  history?: unknown[];
};

/** Selected alongside project_file wherever a caller wants the whole file. */
const projectFileContentColumns = {
  /** Legacy jsonb scene: only set on rows the backfill has not moved yet. */
  scene: projectFileContent.scene,
  sceneKey: projectFileContent.sceneKey,
  spec: projectFileContent.spec,
  content: projectFileContent.content,
  history: projectFileContent.history,
  /** The canvas keeps this to send its next save as a delta. */
  sceneRev: projectFileContent.sceneRev,
};

/**
 * Write the content row for a file, creating it if missing.
 *
 * An upsert rather than insert-then-update because every caller already does not
 * know or care which case it is in: create paths know the row is new, generation
 * and PATCH paths know it should exist, none benefits from finding out. It also
 * means a file whose content row went missing repairs itself on the next write
 * instead of failing forever.
 *
 * Only columns whose value is not undefined are written. That matters for PATCH,
 * where the client sends scene alone and must not blank history and spec as a
 * side effect. The test is on the value rather than key presence ("spec" in
 * patch) because an optional Zod field can land in the parsed object as explicit
 * undefined, which key presence would treat as a write. An explicit null still
 * clears the column, which is the intended way to do it.
 *
 * Returns the scene key this write replaced. The caller deletes that object only
 * after its transaction commits; deleting earlier would orphan the row on rollback.
 */
export async function writeProjectFileContent(
  tx: Db,
  fileId: string,
  patch: ProjectFileContentPatch,
  // false for callers that do not read the content back. Skipping the RETURNING
  // keeps a legacy jsonb scene from being detoasted for nothing.
  { returnContent = true }: { returnContent?: boolean } = {},
) {
  const { sceneKey, ...rest } = patch;
  const columns: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );

  // Every writer of scene advances scene_rev, not just the PATCH route. Repository
  // generation replaces whole scenes through here, and a canvas holding the file
  // open would otherwise keep a baseline the server had silently moved past and
  // have its next delta merged into the generated scene instead of rejected.
  const writesScene = sceneKey !== undefined;

  // Nothing to write, and Postgres rejects an empty DO UPDATE SET. Reaching
  // here means the caller had no content fields at all, so the existing row (or
  // the absence of one) is already correct.
  if (!writesScene && Object.keys(columns).length === 0) {
    if (!returnContent) return { content: null, previousSceneKey: null };
    const [existing] = await tx
      .select(projectFileContentColumns)
      .from(projectFileContent)
      .where(eq(projectFileContent.fileId, fileId));
    return {
      content: existing ?? {
        scene: null,
        sceneKey: null,
        spec: null,
        content: null,
        history: [],
        sceneRev: null,
      },
      previousSceneKey: null,
    };
  }

  let previousSceneKey: string | null = null;
  if (writesScene) {
    // Locked so a concurrent writer cannot swap the key between this read and
    // the upsert below, which takes the same row lock anyway.
    const [current] = await tx
      .select({ sceneKey: projectFileContent.sceneKey })
      .from(projectFileContent)
      .where(eq(projectFileContent.fileId, fileId))
      .for("update");
    previousSceneKey = current?.sceneKey ?? null;
    // The jsonb column is cleared on every scene write, so a migrated row never
    // carries two copies of its scene.
    Object.assign(columns, { sceneKey, scene: null });
  }

  const insert = tx
    .insert(projectFileContent)
    // history is NOT NULL with no database default, so the insert half of the
    // upsert has to carry one even when the caller said nothing about history.
    .values({ fileId, history: [], ...columns, sceneRev: writesScene ? 1 : 0 })
    .onConflictDoUpdate({
      target: projectFileContent.fileId,
      set: writesScene
        ? { ...columns, sceneRev: sql`${projectFileContent.sceneRev} + 1` }
        : columns,
    });

  if (!returnContent) {
    await insert;
    return { content: null, previousSceneKey };
  }

  const [row] = await insert.returning(projectFileContentColumns);
  return { content: row ?? null, previousSceneKey };
}

/**
 * Read one file whole; metadata joined to its content row.
 *
 * Left, not inner: a file is a file even if its content row is missing, and the
 * canvas would rather open empty than 404 on a document the file list just
 * showed. The nulls are normalised here so callers see the same shape either way.
 */
export function selectProjectFileColumns() {
  return {
    id: projectFile.id,
    projectId: projectFile.projectId,
    type: projectFile.type,
    name: projectFile.name,
    createdAt: projectFile.createdAt,
    updatedAt: projectFile.updatedAt,
    ...projectFileContentColumns,
  };
}

/** Normalise a left-joined row so a missing content row reads as an empty file. */
export function withContentDefaults<T extends { history?: unknown }>(row: T) {
  return { ...row, history: row.history ?? [] };
}

export const projectFileContentJoin = eq(projectFileContent.fileId, projectFile.id);
