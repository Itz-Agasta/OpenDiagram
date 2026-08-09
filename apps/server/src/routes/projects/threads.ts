import { and, db, eq } from "@OpenDiagram/db";
import { project, projectFile, projectFileThread } from "@OpenDiagram/db/schema/projects";
import { Hono } from "hono";
import { z } from "zod";
import {
  appendThreadMessages,
  listThreadMessages,
  listThreads,
  loadActiveThread,
  lockOwnedThread,
  ownsThreadSubquery,
} from "../../lib/project-threads";
import type { AuthVariables } from "../../lib/require-auth";

const messageSchema = z.object({
  clientId: z.string().min(1).max(200),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.unknown()),
});

const appendSchema = z.object({
  // Deliberately NOT `.min(1)`. A turn can legitimately produce no new storable
  // message and still produce a diagram: `uiMessageToStoredChatMessage` drops any
  // message whose parts survive to nothing, which is exactly what an assistant
  // message carrying only a `draw_diagram` tool call becomes. `.min(1)` rejected
  // those requests with a 400. Confirmed in `.evlog/logs`: two 400s on this
  // route, both on the turn after `ask_user`. An empty list is a no-op for the
  // insert and still bumps `updated_at`.
  //
  // `max` is a payload bound, not a backlog bound -- `persistTurn` chunks to it
  // rather than being permanently rejected for having too much to catch up on.
  messages: z.array(messageSchema).max(20),
});

const createThreadSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

// No `refine` rejecting an empty body on purpose: an empty patch is meaningful
// here. `updated_at` is what decides which thread reopens, so touching it with no
// other change is exactly how resuming an older conversation makes it active.
const patchThreadSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const threadsRoute = new Hono<{ Variables: AuthVariables }>();

/**
 * What the workspace opens with: the newest thread for this canvas plus its
 * trailing messages, in one round trip. 204 when the canvas has no conversation
 * yet, which is a normal state and not an error.
 */
threadsRoute.get("/:projectId/files/:fileId/threads/active", async (c) => {
  const thread = await loadActiveThread(
    c.req.param("fileId"),
    c.req.param("projectId"),
    c.get("userId"),
  );

  if (!thread) return c.body(null, 204);
  return c.json({ thread });
});

/** The history dropdown. Metadata only -- no message bodies, no `spec`. */
threadsRoute.get("/:projectId/files/:fileId/threads", async (c) => {
  const threads = await listThreads(
    c.req.param("fileId"),
    c.req.param("projectId"),
    c.get("userId"),
  );
  return c.json({ threads });
});

/** The "New chat" button. Starts blank; the canvas and its diagrams are untouched. */
threadsRoute.post("/:projectId/files/:fileId/threads", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const fileId = c.req.param("fileId");
  const body = await c.req.json().catch(() => null);
  const parsed = createThreadSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  // Ownership as its own statement rather than folded into the INSERT. Same call
  // the repo already makes for `POST /:projectId/files`: this fires when someone
  // clicks "New chat", so the second round trip costs nothing measurable, and an
  // `INSERT ... SELECT` would blur "file not found" into "insert failed".
  const [owned] = await db
    .select({ id: projectFile.id })
    .from(projectFile)
    .innerJoin(project, eq(project.id, projectFile.projectId))
    .where(and(eq(projectFile.id, fileId), eq(project.id, projectId), eq(project.userId, userId)));

  if (!owned) return c.json({ error: "Not found" }, 404);

  const [thread] = await db
    .insert(projectFileThread)
    .values({ projectId, fileId, title: parsed.data.title ?? "New chat" })
    .returning({
      id: projectFileThread.id,
      title: projectFileThread.title,
      createdAt: projectFileThread.createdAt,
      updatedAt: projectFileThread.updatedAt,
    });

  if (!thread) return c.json({ error: "Not found" }, 404);
  return c.json({ thread }, 201);
});

/** Older messages, walking back from `before`. Oldest-first in the response. */
threadsRoute.get("/:projectId/threads/:threadId/messages", async (c) => {
  const beforeParam = c.req.query("before");
  const before = beforeParam === undefined ? undefined : Number(beforeParam);

  if (before !== undefined && !Number.isInteger(before)) {
    return c.json({ error: "Invalid request", issues: ["before must be an integer"] }, 400);
  }

  const messages = await listThreadMessages(
    c.req.param("threadId"),
    c.req.param("projectId"),
    c.get("userId"),
    before,
  );
  return c.json({ messages });
});

/**
 * Append a completed turn. Replaces rewriting the whole transcript per turn -- the
 * shape that made byte cost grow with the square of conversation length.
 */
threadsRoute.post("/:projectId/threads/:threadId/messages", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const threadId = c.req.param("threadId");
  const body = await c.req.json().catch(() => null);
  const parsed = appendSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const { messages } = parsed.data;

  // Ownership rides on the statement that locks the thread, inside the
  // transaction: two overlapping appends would otherwise read the same
  // `MAX(seq)` and collide on the message primary key, losing the later turn.
  // `updated_at` decides which thread reopens, so it moves with the messages or
  // not at all.
  const written = await db.transaction(async (tx) => {
    const owned = await lockOwnedThread(tx, threadId, projectId, userId);
    if (!owned) return null;

    const rows = await appendThreadMessages(tx, threadId, messages);
    await tx
      .update(projectFileThread)
      .set({ updatedAt: new Date() })
      .where(eq(projectFileThread.id, threadId));
    return rows;
  });

  if (!written) return c.json({ error: "Not found" }, 404);
  return c.json({ messages: written }, 201);
});

/** Rename a thread, or touch it so it becomes the one this canvas reopens on. */
threadsRoute.patch("/:projectId/threads/:threadId", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = patchThreadSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  // Ownership folded into the WHERE: one statement instead of two.
  const [thread] = await db
    .update(projectFileThread)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(ownsThreadSubquery(c.req.param("threadId"), c.req.param("projectId"), c.get("userId")))
    .returning({
      id: projectFileThread.id,
      title: projectFileThread.title,
      updatedAt: projectFileThread.updatedAt,
    });

  if (!thread) return c.json({ error: "Not found" }, 404);
  return c.json({ thread });
});

/** Delete a conversation. Its messages go with it via the cascade on `thread_id`. */
threadsRoute.delete("/:projectId/threads/:threadId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const threadId = c.req.param("threadId");

  // Same collapse as the PATCH above: ownership is part of the DELETE.
  const [deleted] = await db
    .delete(projectFileThread)
    .where(ownsThreadSubquery(threadId, projectId, userId))
    .returning({ id: projectFileThread.id });

  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
