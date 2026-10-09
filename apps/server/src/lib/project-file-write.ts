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
 * The scene itself is not in this statement: the caller uploads it to object
 * storage first and passes the key. SET lists are built per request so a write
 * that does not touch a column never reads or rewrites it.
 */

type ProjectFileRow = {
  id: string;
  projectId: string;
  type: "diagram" | "doc";
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type ProjectFileContentRow = {
  /** Legacy jsonb scene, only for rows not yet moved to object storage. */
  scene: unknown;
  sceneKey: string | null;
  spec: unknown;
  content: unknown;
  history: unknown;
};

export type WriteProjectFileResult =
  | {
      status: "ok";
      file: ProjectFileRow;
      sceneRev: number | null;
      /**
       * The scene object this write replaced, for the caller to delete after
       * the response is safe. Null when no scene was written or none existed.
       */
      previousSceneKey: string | null;
      /** Present only when returnContent was asked for. */
      content: ProjectFileContentRow | null;
    }
  | { status: "not-found" }
  /** Only reachable on the delta path: the client's base revision is not current. */
  | { status: "stale" };

type ContentColumns = {
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
  /** Object storage key of a scene already uploaded. Advances scene_rev. */
  sceneKey?: string;
  /**
   * Set when the scene is a merged delta. Turns the write into a guarded
   * UPDATE so a stale merge cannot silently overwrite the current scene.
   */
  expectedSceneRev?: number;
  /**
   * Echo the content columns back. Off for canvas autosave, the agent's spec
   * write, and chat history write (all fire-and-forget). On for rename and
   * manual save, which call setActiveFile with the response.
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

const CONTENT_COLUMNS = ["spec", "content", "history"] as const;

/** Column name to value, for the columns this request writes. */
type Assignment = [column: string, value: SQL];

export async function writeProjectFile(
  input: WriteProjectFileInput,
): Promise<WriteProjectFileResult> {
  const { projectId, fileId, userId, metadata, content, sceneKey, expectedSceneRev } = input;
  const echo = input.returnContent === true;
  const writesScene = sceneKey !== undefined;

  const assignments: Assignment[] = CONTENT_COLUMNS.filter(
    (column) => content[column] !== undefined,
  ).map((column) => [column, jsonb(content[column])]);
  // The jsonb column is cleared on every scene write, so a migrated row never
  // carries two copies of its scene.
  if (writesScene) assignments.push(["scene_key", sql`${sceneKey}`], ["scene", sql`NULL`]);

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

  // FOR UPDATE, not a plain read: two scene writes racing on one row would both
  // see the snapshot's key, and the second would report the wrong previous
  // object and leak the first one's. Locking waits for the row and returns the
  // latest committed key. Same lock order as below: project_file, then content.
  const prev = sql`, prev AS (
      SELECT c."scene_key" FROM "project_file_content" AS c
        JOIN owned ON c."file_id" = owned."id"
       FOR UPDATE OF c
    )`;

  // Qualified: prev also has a scene_key column.
  const echoed = (from: string) =>
    echo
      ? sql.raw(
          ["scene", "scene_key", "spec", "content", "history"]
            .map((column) => `${from}."${column}"`)
            .join(", ") + ",",
        )
      : sql``;

  // Metadata only: skip project_file_content entirely. A rename must not touch
  // the content row. LEFT JOIN ON true so a guarded write that matched nothing
  // still returns the file row, which is what tells stale from not-found below.
  const statement =
    assignments.length === 0
      ? sql`${owned}
            SELECT owned.*, ${echoed("cc")} cc."scene_rev" AS "content_scene_rev",
                   NULL AS "previous_scene_key"
              FROM owned LEFT JOIN "project_file_content" AS cc ON cc."file_id" = owned."id"`
      : sql`${owned}${writesScene ? prev : sql``}${
          expectedSceneRev === undefined
            ? upsertContent(assignments, writesScene, echo)
            : guardedContent(assignments, writesScene, expectedSceneRev, echo)
        }
            SELECT owned.*, ${echoed("changed")} changed."scene_rev" AS "content_scene_rev",
                   ${writesScene ? sql`prev."scene_key"` : sql`NULL`} AS "previous_scene_key"
              FROM owned LEFT JOIN changed ON true
              ${writesScene ? sql`LEFT JOIN prev ON true` : sql``}`;

  const result = await db.execute<{
    id: string;
    project_id: string;
    type: "diagram" | "doc";
    name: string;
    created_at: Date;
    updated_at: Date;
    content_scene_rev: number | null;
    previous_scene_key: string | null;
    scene?: unknown;
    scene_key?: string | null;
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
    previousSceneKey: row.previous_scene_key,
    content: echo
      ? {
          scene: row.scene,
          sceneKey: row.scene_key ?? null,
          spec: row.spec,
          content: row.content,
          history: row.history,
        }
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
function upsertContent(assignments: Assignment[], writesScene: boolean, echo: boolean): SQL {
  // history is NOT NULL with no database default, so the INSERT half always
  // carries one even when the caller said nothing about it.
  const inserted = assignments.some(([column]) => column === "history")
    ? assignments
    : [...assignments, ["history", sql`'[]'::jsonb`] as Assignment];
  const names = inserted.map(([column]) => sql.raw(`"${column}"`));
  const values = inserted.map(([, value]) => value);

  const sets = assignments.map(([column]) => sql.raw(`"${column}" = excluded."${column}"`));
  if (writesScene) sets.push(sql`"scene_rev" = "project_file_content"."scene_rev" + 1`);

  return sql`, changed AS (
      INSERT INTO "project_file_content" (${sql.join(names, sql`, `)}, "file_id", "scene_rev")
      SELECT ${sql.join(values, sql`, `)}, owned."id", ${writesScene ? 1 : 0}
        FROM owned ${readsPrev(writesScene)}
      ON CONFLICT ("file_id") DO UPDATE SET ${sql.join(sets, sql`, `)}
      RETURNING ${returning(echo)}
    )`;
}

/**
 * Makes the content write read prev, which forces prev (and its row lock) to run
 * before the write touches the row. Left unreferenced, prev can run after the
 * write, and FOR UPDATE skips a row the same statement already updated, so the
 * previous key came back null and every replaced object leaked.
 */
function readsPrev(writesScene: boolean): SQL {
  return writesScene ? sql`LEFT JOIN prev ON true` : sql``;
}

/** The content columns a write hands back, which is nothing extra unless asked. */
function returning(echo: boolean): SQL {
  return echo
    ? sql`"scene_rev", "scene", "scene_key", "spec", "content", "history"`
    : sql`"scene_rev"`;
}

/**
 * The delta write: an UPDATE guarded on the revision, not an upsert. A missing
 * content row means the client's base revision describes a scene that does not
 * exist; inserting the merge result would present a partial scene as if it were
 * whole. Matching nothing here is correct, and the 409 makes the client resend
 * a full snapshot.
 */
function guardedContent(
  assignments: Assignment[],
  writesScene: boolean,
  expectedSceneRev: number,
  echo: boolean,
): SQL {
  const sets = assignments.map(([column, value]) => sql`${sql.raw(`"${column}"`)} = ${value}`);
  sets.push(sql`"scene_rev" = c."scene_rev" + 1`);

  return sql`, changed AS (
      UPDATE "project_file_content" AS c
         SET ${sql.join(sets, sql`, `)}
        FROM owned ${readsPrev(writesScene)}
       WHERE c."file_id" = owned."id" AND c."scene_rev" = ${expectedSceneRev}
      RETURNING ${returning(echo)}
    )`;
}
