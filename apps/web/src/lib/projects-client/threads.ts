import { env } from "@OpenDiagram/env/web";
import { readProjectResponse } from "./http";
import type { ChatThread, ChatThreadMessage, ChatThreadSummary } from "./types";

const base = (projectId: string) => `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}`;

/**
 * The newest thread for a canvas, with its trailing messages.
 *
 * Null when the canvas has no conversation yet -- a normal state, answered 204 by
 * the server rather than 404, so an empty canvas is not an error path.
 */
export async function getActiveThread(
  projectId: string,
  fileId: string,
): Promise<ChatThread | null> {
  const response = await fetch(`${base(projectId)}/files/${fileId}/threads/active`, {
    credentials: "include",
  });
  if (response.status === 204) return null;
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load chat.");
  return data.thread;
}

/** The history list. Metadata only -- no message bodies. */
export async function listThreads(projectId: string, fileId: string): Promise<ChatThreadSummary[]> {
  const response = await fetch(`${base(projectId)}/files/${fileId}/threads`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load chat history.");
  return data.threads;
}

export async function createThread(
  projectId: string,
  fileId: string,
  title?: string,
): Promise<ChatThreadSummary> {
  const response = await fetch(`${base(projectId)}/files/${fileId}/threads`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not start a new chat.");
  return data.thread;
}

/** One page of older messages, walking back from `before`. Oldest-first. */
export async function listThreadMessages(
  projectId: string,
  threadId: string,
  before?: number,
): Promise<ChatThreadMessage[]> {
  const query = before === undefined ? "" : `?before=${before}`;
  const response = await fetch(`${base(projectId)}/threads/${threadId}/messages${query}`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load messages.");
  return data.messages;
}

/**
 * Append a completed turn.
 *
 * Only the messages this turn produced, never the whole transcript -- that shape
 * is what made byte cost grow with the square of conversation length.
 */
export async function appendThreadMessages(
  projectId: string,
  threadId: string,
  messages: { clientId: string; role: "user" | "assistant"; parts: unknown[] }[],
  spec?: unknown,
  frameId?: string | null,
): Promise<{ seq: number; clientId: string }[]> {
  const response = await fetch(`${base(projectId)}/threads/${threadId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      ...(spec === undefined ? {} : { spec }),
      ...(frameId === undefined ? {} : { frameId }),
    }),
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not save chat.");
  return data.messages;
}

export async function deleteThread(projectId: string, threadId: string): Promise<void> {
  const response = await fetch(`${base(projectId)}/threads/${threadId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not delete chat.");
}

/**
 * Make a thread the active one by touching `updated_at`.
 *
 * "Active" is defined as the most recently updated thread, so resuming an older
 * conversation is a touch and then a re-read -- no extra endpoint, and no
 * `active_thread_id` column to keep consistent.
 */
export async function patchThreadTouched(projectId: string, threadId: string): Promise<void> {
  const response = await fetch(`${base(projectId)}/threads/${threadId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not open that chat.");
}
