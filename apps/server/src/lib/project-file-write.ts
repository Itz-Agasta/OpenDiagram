import { db, sql } from "@OpenDiagram/db";
import type { SQL } from "drizzle-orm";

/**
 * The one statement that writes a project file.
 *
 * Replaces BEGIN / UPDATE / upsert / COMMIT with a single data-modifying CTE.
 * Four round trips down to one. Sub-statements in a WITH run exactly once and
 * always to completion, whether or not the primary query reads their output.
 *
 * https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-MODIFYING
 *
 * Ownership rides the project_file UPDATE. No row out of owned means the file
 * is missing or not this user's; the content write's FROM owned matches nothing;
 * the outer SELECT returns nothing. Same three-way answer as before, one trip
 * instead of four.
 *
 * SET lists are built per request. A CASE WHEN would spare the branching but
 * reads and rewrites the TOASTed scene on every request that does not touch it,
 * which is worse than the problem being solved.
 */

export type ProjectFileRow = {
  id: string;
  projectId: string;
  type: "diagram" | "doc";
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectFileContentRow = {
  scene: unknown;
  spec: unknown;
  content: unknown;
  history: unknown;
};

export type WriteProjectFileResult =
  | {
      status: "ok";
      file: ProjectFileRow;
      sceneRev: number | null;
      /** Present only when returnContent was asked for. */
      content: ProjectFileContentRow | null;
    }
  | { status: "not-found" }
  /** Only reachable on the delta path: the client's base revision is not current. */
  | { status: "stale" };

type ContentColumns = {
  scene?: unknown;
  spec?: unknown;
  content?: unknown;
  history?: unknown[];
};

export type WriteProjectFileInput = {
  projectId: string;
  fileId: string;
  userId: string;
  metadata: { name?: string; type?: "diagram" | "doc" };
  content: ContentColumns;
  /**
   * Set when content.scene is a merged delta. Turns the write into a guarded
   * UPDATE so a stale merge cannot silently overwrite the current scene.
   */
  expectedSceneRev?: number;
  /**
   * Echo the content columns back. Off for canvas autosave, the agent's spec
   * write, and chat history write (all fire-and-forget; RETURNING would detoast
   * a scene just to serialize it to a client that discards it). On for rename
   * and manual save, which call setActiveFile with the response.
   */
  returnContent?: boolean;
};

/**
 * pg renders a JS array as a Postgres array literal, not JSON, so every jsonb
 * value is stringified and cast explicitly. An explicit null reaches the column
 * as SQL NULL (not jsonb 'null'), which is how a caller clears a column.
 */
function jsonb(value: unknown): SQL {
  if (value === null) return sql`NULL`;
  return sql`${JSON.stringify(value)}::jsonb`;
}

const CONTENT_COLUMNS = ["scene", "spec", "content", "history"] as const;

export async function writeProjectFile(
  input: WriteProjectFileInput,
): Promise<WriteProjectFileResult> {
  const { projectId, fileId, userId, metadata, content, expectedSceneRev, returnContent } = input;

  const written = CONTENT_COLUMNS.filter((column) => content[column] !== undefined);
  const writesScene = written.includes("scene");
  const echo = returnContent === true;

  const fileSets: SQL[] = [sql`"updated_at" = now()`];
  if (metadata.name !== undefined) fileSets.push(sql`"name" = ${metadata.name}`);
  if (metadata.type !== undefined) fileSets.push(sql`"type" = ${metadata.type}`);

  const owned = sql`
    WITH owned AS (
      UPDATE "project_file" AS f
         SET ${sql.join(fileSets, sql`, `)}
        FROM "project" AS p
       WHERE f."id" = ${fileId} AND f."project_id" = ${projectId}
         AND p."id" = ${projectId} AND p."user_id" = ${userId}
      RETURNING f."id", f."project_id", f."type", f."name", f."created_at", f."updated_at"
    )`;

  const echoed = echo ? sql`"scene", "spec", "content", "history",` : sql``;

  // Metadata only: skip project_file_content entirely. A rename must not rewrite
  // a 70 kB TOASTed scene. The caller reads content off a join, not RETURNING.
  //
  // LEFT JOIN ON true so a guarded write that matched nothing still returns the
  // file row, which is what tells stale from not-found below.
  const statement =
    written.length === 0
      ? sql`${owned}
            SELECT owned.*, ${echoed} cc."scene_rev" AS "content_scene_rev"
              FROM owned LEFT JOIN "project_file_content" AS cc ON cc."file_id" = owned."id"`
      : sql`${owned}${
          expectedSceneRev === undefined
            ? upsertContent(written, content, writesScene, echo)
            : guardedContent(written, content, expectedSceneRev, echo)
        }
            SELECT owned.*, ${echoed} changed."scene_rev" AS "content_scene_rev"
              FROM owned LEFT JOIN changed ON true`;

  const result = await db.execute<{
    id: string;
    project_id: string;
    type: "diagram" | "doc";
    name: string;
    created_at: Date;
    updated_at: Date;
    content_scene_rev: number | null;
    scene?: unknown;
    spec?: unknown;
    content?: unknown;
    history?: unknown;
  }>(statement);

  const row = result.rows[0];
  if (!row) return { status: "not-found" };
  // File exists and is this user's, but the guarded UPDATE matched nothing.
  // Revision moved under the client between read and write.
  if (expectedSceneRev !== undefined && row.content_scene_rev === null) {
    return { status: "stale" };
  }

  return {
    status: "ok",
    sceneRev: row.content_scene_rev,
    content: echo
      ? { scene: row.scene, spec: row.spec, content: row.content, history: row.history }
      : null,
    file: {
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}

/**
 * The ordinary write: create the content row if missing, else overwrite the
 * columns the caller named. Self-repairing: a file whose content row went
 * missing recovers on its next save instead of failing forever.
 */
function upsertContent(
  written: readonly (keyof ContentColumns)[],
  content: ContentColumns,
  writesScene: boolean,
  echo: boolean,
): SQL {
  // history is NOT NULL with no database default, so the INSERT half always
  // carries one even when the caller said nothing about it.
  const columns = new Set<string>([...written, "history"]);
  const names = [...columns].map((column) => sql.raw(`"${column}"`));
  const values = [...columns].map((column) =>
    column === "history" && content.history === undefined
      ? sql`'[]'::jsonb`
      : jsonb(content[column as keyof ContentColumns]),
  );

  const sets = written.map((column) => sql.raw(`"${column}" = excluded."${column}"`));
  if (writesScene) sets.push(sql`"scene_rev" = "project_file_content"."scene_rev" + 1`);

  return sql`, changed AS (
      INSERT INTO "project_file_content" (${sql.join(names, sql`, `)}, "file_id", "scene_rev")
      SELECT ${sql.join(values, sql`, `)}, owned."id", ${writesScene ? 1 : 0} FROM owned
      ON CONFLICT ("file_id") DO UPDATE SET ${sql.join(sets, sql`, `)}
      RETURNING ${returning(echo)}
    )`;
}

/** The content columns a write hands back, which is nothing extra unless asked. */
function returning(echo: boolean): SQL {
  return echo ? sql`"scene_rev", "scene", "spec", "content", "history"` : sql`"scene_rev"`;
}

/**
 * The delta write: an UPDATE guarded on the revision, not an upsert. A missing
 * content row means the client's base revision describes a scene that does not
 * exist; inserting the merge result would present a partial scene as if it were
 * whole. Matching nothing here is correct, and the 409 makes the client resend
 * a full snapshot.
 */
function guardedContent(
  written: readonly (keyof ContentColumns)[],
  content: ContentColumns,
  expectedSceneRev: number,
  echo: boolean,
): SQL {
  const sets = written.map((column) => sql`${sql.raw(`"${column}"`)} = ${jsonb(content[column])}`);
  sets.push(sql`"scene_rev" = c."scene_rev" + 1`);

  return sql`, changed AS (
      UPDATE "project_file_content" AS c
         SET ${sql.join(sets, sql`, `)}
        FROM owned
       WHERE c."file_id" = owned."id" AND c."scene_rev" = ${expectedSceneRev}
      RETURNING ${returning(echo)}
    )`;
}
