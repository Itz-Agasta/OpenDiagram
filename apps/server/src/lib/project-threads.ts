import { and, db, desc, eq, lt, sql } from "@OpenDiagram/db";
import { project, projectFileMessage, projectFileThread } from "@OpenDiagram/db/schema/projects";

/** Either the pooled `db` or an open transaction. */
type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * How much of a thread the panel opens on. Older messages are still in Postgres
 * and paginate in behind `before`; this is only what arrives unasked.
 */
export const THREAD_PAGE_SIZE = 50;

/**
 * How many trailing messages the model sees. The thread's `spec` already carries
 * the accumulated state of the diagram, so older turns add little beyond stated
 * preferences -- and the whole point of threading was to stop paying for context
 * the current diagram already encodes.
 */
export const MODEL_CONTEXT_MESSAGES = 20;

export type ThreadMessage = {
  seq: number;
  clientId: string;
  role: "user" | "assistant";
  parts: unknown;
};

/**
 * Ownership, expressed once.
 *
 * The thread carries `project_id` directly, so proving a caller owns it is a
 * single join to `project` rather than a walk through `project_file`. That is the
 * reason the column exists -- it is on the path of every read and write here.
 */
function ownsThread(threadId: string, projectId: string, userId: string) {
  return and(
    eq(projectFileThread.id, threadId),
    eq(projectFileThread.projectId, projectId),
    eq(project.userId, userId),
  );
}

/**
 * The newest thread for a file, with its trailing messages, in one round trip.
 *
 * The messages come back through a json aggregate rather than a join because a
 * join repeats the thread's columns once per message -- and `spec` is the largest
 * of them, so fifty messages would mean fifty copies of a diagram spec on the
 * wire. The aggregate returns one row.
 *
 * Null when the file has no thread yet, which is the normal state of a canvas
 * nobody has talked to.
 */
export async function loadActiveThread(fileId: string, projectId: string, userId: string) {
  const [row] = await db
    .select({
      id: projectFileThread.id,
      title: projectFileThread.title,
      spec: projectFileThread.spec,
      frameId: projectFileThread.frameId,
      updatedAt: projectFileThread.updatedAt,
      messages: sql<ThreadMessage[]>`coalesce((
        select json_agg(m order by m.seq)
        from (
          select seq, client_id as "clientId", role, parts
          from ${projectFileMessage}
          where ${projectFileMessage.threadId} = ${projectFileThread.id}
          order by seq desc
          limit ${THREAD_PAGE_SIZE}
        ) m
      ), '[]'::json)`,
    })
    .from(projectFileThread)
    .innerJoin(project, eq(project.id, projectFileThread.projectId))
    .where(
      and(
        eq(projectFileThread.fileId, fileId),
        eq(projectFileThread.projectId, projectId),
        eq(project.userId, userId),
      ),
    )
    .orderBy(desc(projectFileThread.updatedAt))
    .limit(1);

  return row ?? null;
}

/** Thread metadata for the history list. Deliberately never selects `spec`. */
export function listThreads(fileId: string, projectId: string, userId: string) {
  return db
    .select({
      id: projectFileThread.id,
      title: projectFileThread.title,
      createdAt: projectFileThread.createdAt,
      updatedAt: projectFileThread.updatedAt,
    })
    .from(projectFileThread)
    .innerJoin(project, eq(project.id, projectFileThread.projectId))
    .where(
      and(
        eq(projectFileThread.fileId, fileId),
        eq(projectFileThread.projectId, projectId),
        eq(project.userId, userId),
      ),
    )
    .orderBy(desc(projectFileThread.updatedAt));
}

/**
 * One page of older messages, walking backwards from `before`.
 *
 * Ownership rides on the same statement rather than a check in front of it, so
 * paging stays one round trip. An empty page is the honest answer for both "you
 * reached the start" and "that thread is not yours" -- neither leaks anything.
 */
export async function listThreadMessages(
  threadId: string,
  projectId: string,
  userId: string,
  before?: number,
) {
  const rows = await db
    .select({
      seq: projectFileMessage.seq,
      clientId: projectFileMessage.clientId,
      role: projectFileMessage.role,
      parts: projectFileMessage.parts,
    })
    .from(projectFileMessage)
    .innerJoin(projectFileThread, eq(projectFileThread.id, projectFileMessage.threadId))
    .innerJoin(project, eq(project.id, projectFileThread.projectId))
    .where(
      and(
        ownsThread(threadId, projectId, userId),
        before === undefined ? undefined : lt(projectFileMessage.seq, before),
      ),
    )
    .orderBy(desc(projectFileMessage.seq))
    .limit(THREAD_PAGE_SIZE);

  // Read newest-first so the index answers with a backward scan and `limit` cuts
  // the right end; the caller wants oldest-first to render.
  return rows.reverse();
}

/**
 * Append messages to a thread, numbering them from wherever it left off.
 *
 * `seq` is assigned in SQL as `COALESCE(MAX(seq), 0) + 1` scoped to the thread,
 * which the primary key answers with a backward index scan rather than a count.
 * Two writers racing here collide on that key and one fails, which is the right
 * outcome: a rejected write is recoverable, a silently reordered conversation is
 * not. A single user typing into a single thread does not produce that race.
 */
export async function appendThreadMessages(
  tx: Db,
  threadId: string,
  messages: { clientId: string; role: "user" | "assistant"; parts: unknown }[],
) {
  if (messages.length === 0) return [];

  const base = sql`(select coalesce(max(seq), 0) from ${projectFileMessage} where ${projectFileMessage.threadId} = ${threadId})`;

  return tx
    .insert(projectFileMessage)
    .values(
      messages.map((message, index) => ({
        threadId,
        // Offset within this batch, so one statement can carry several messages
        // and still produce a contiguous run.
        seq: sql<number>`${base} + ${index + 1}`,
        clientId: message.clientId,
        role: message.role,
        parts: message.parts,
      })),
    )
    .returning({ seq: projectFileMessage.seq, clientId: projectFileMessage.clientId });
}

/** Confirms a thread belongs to this user before a write touches it. */
export async function assertThreadOwned(threadId: string, projectId: string, userId: string) {
  const [row] = await db
    .select({ id: projectFileThread.id })
    .from(projectFileThread)
    .innerJoin(project, eq(project.id, projectFileThread.projectId))
    .where(ownsThread(threadId, projectId, userId));

  return row ?? null;
}
