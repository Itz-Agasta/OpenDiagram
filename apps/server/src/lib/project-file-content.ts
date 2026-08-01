import { db, eq } from "@OpenDiagram/db";
import { projectFile, projectFileContent } from "@OpenDiagram/db/schema/projects";

/** Either the pooled `db` or an open transaction -- both satisfy these calls. */
type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The large columns, which live in `project_file_content`, not `project_file`. */
export type ProjectFileContentPatch = {
  scene?: unknown;
  spec?: unknown;
  content?: unknown;
  history?: unknown[];
};

/** Selected alongside `project_file` wherever a caller wants the whole file. */
export const projectFileContentColumns = {
  scene: projectFileContent.scene,
  spec: projectFileContent.spec,
  content: projectFileContent.content,
  history: projectFileContent.history,
};

/**
 * Write the content row for a file, creating it if it is not there yet.
 *
 * An upsert rather than an insert-then-update pair because every caller is
 * already in the position of not knowing or not caring which case it is in: the
 * create paths know the row is new, the generation and PATCH paths know it
 * should exist, and none of them benefits from finding out. It also means a file
 * whose content row went missing repairs itself on the next write instead of
 * failing forever.
 *
 * Only the columns whose value is not `undefined` are written. That matters for
 * PATCH, where the client sends `scene` alone and must not blank `history` and
 * `spec` as a side effect. The test is on the value rather than key presence
 * (`"scene" in patch`) because an optional Zod field can land in the parsed
 * object as an explicit `undefined`, which key presence would treat as a write.
 * An explicit `null` still clears the column, which is the intended way to do it.
 */
export async function writeProjectFileContent(
  tx: Db,
  fileId: string,
  patch: ProjectFileContentPatch,
) {
  const columns = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );

  // Nothing to write, and Postgres rejects an empty `DO UPDATE SET`. Reaching
  // here means the caller had no content fields at all, so the existing row --
  // or the absence of one -- is already correct.
  if (Object.keys(columns).length === 0) {
    const [existing] = await tx
      .select(projectFileContentColumns)
      .from(projectFileContent)
      .where(eq(projectFileContent.fileId, fileId));
    return existing ?? { scene: null, spec: null, content: null, history: [] };
  }

  const [row] = await tx
    .insert(projectFileContent)
    // `history` is NOT NULL with no database default, so the insert half of the
    // upsert has to carry one even when the caller said nothing about history.
    .values({ fileId, history: [], ...columns })
    .onConflictDoUpdate({ target: projectFileContent.fileId, set: columns })
    .returning(projectFileContentColumns);

  return row;
}

/**
 * Read one file whole -- metadata joined to its content row.
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

/** A file row joined to its content: what `selectProjectFileColumns` produces. */
export type ProjectFileWithContent = {
  id: string;
  projectId: string;
  type: (typeof projectFile.$inferSelect)["type"];
  name: string;
  createdAt: Date;
  updatedAt: Date;
  scene: unknown;
  spec: unknown;
  content: unknown;
  history: unknown;
};

/** Normalise a left-joined row so a missing content row reads as an empty file. */
export function withContentDefaults<T extends { history?: unknown }>(row: T) {
  return { ...row, history: row.history ?? [] };
}

export const projectFileContentJoin = eq(projectFileContent.fileId, projectFile.id);
