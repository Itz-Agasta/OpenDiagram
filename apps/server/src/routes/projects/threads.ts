import { and, db, eq } from "@OpenDiagram/db";
import { project, projectFile, projectFileThread } from "@OpenDiagram/db/schema/projects";
import { Hono } from "hono";
import { z } from "zod";
import {
  appendThreadMessages,
  assertThreadOwned,
  listThreadMessages,
  listThreads,
  loadActiveThread,
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
  // those requests with a 400, and because the client's `persistTurn` swallows
  // failures, the `spec` and `frameId` riding along on the same request were lost
  // silently -- the thread forgot which diagram it had just drawn. Confirmed in
  // `.evlog/logs`: two 400s on this route, both on the turn after `ask_user`.
  //
  // An empty list is a no-op for the insert (`appendThreadMessages` returns early)
  // and leaves the spec/frame update in this route's transaction intact.
  messages: z.array(messageSchema).max(20),
  /** Written alongside the turn so the thread always knows its current diagram. */
  spec: z.unknown().optional(),
  /** The frame that diagram was drawn into, so the next turn replaces it. */
  frameId: z.string().min(1).max(200).nullish(),
});

const createThreadSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

// No `refine` rejecting an empty body on purpose: an empty patch is meaningful
// here. `updated_at` is what decides which thread reopens, so touching it with no
// other change is exactly how resuming an older conversation makes it active.
const patchThreadSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  spec: z.unknown().optional(),
  frameId: z.string().min(1).max(200).nullish(),
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

/** The "New chat" button. Starts blank -- no spec, so the next diagram gets its own frame. */
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

  const owned = await assertThreadOwned(threadId, projectId, userId);
  if (!owned) return c.json({ error: "Not found" }, 404);

  const { messages, spec, frameId } = parsed.data;

  // One transaction: messages written without the matching `spec` would leave the
  // thread describing a diagram it no longer reflects, and `updated_at` is what
  // decides which thread reopens, so it moves with them or not at all.
  const written = await db.transaction(async (tx) => {
    const rows = await appendThreadMessages(tx, threadId, messages);
    await tx
      .update(projectFileThread)
      .set({
        ...(spec === undefined ? {} : { spec }),
        ...(frameId === undefined ? {} : { frameId }),
        updatedAt: new Date(),
      })
      .where(eq(projectFileThread.id, threadId));
    return rows;
  });

  return c.json({ messages: written }, 201);
});

/** Rename a thread, or restamp the diagram it is working on. */
threadsRoute.patch("/:projectId/threads/:threadId", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = patchThreadSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const owned = await assertThreadOwned(
    c.req.param("threadId"),
    c.req.param("projectId"),
    c.get("userId"),
  );
  if (!owned) return c.json({ error: "Not found" }, 404);

  const [thread] = await db
    .update(projectFileThread)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(projectFileThread.id, c.req.param("threadId")))
    .returning({
      id: projectFileThread.id,
      title: projectFileThread.title,
      updatedAt: projectFileThread.updatedAt,
    });

  return c.json({ thread });
});

/** Delete a conversation. Its messages go with it via the cascade on `thread_id`. */
threadsRoute.delete("/:projectId/threads/:threadId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const threadId = c.req.param("threadId");

  const owned = await assertThreadOwned(threadId, projectId, userId);
  if (!owned) return c.json({ error: "Not found" }, 404);

  await db.delete(projectFileThread).where(eq(projectFileThread.id, threadId));
  return c.json({ ok: true });
});
