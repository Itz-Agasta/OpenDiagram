import { getDevFetch } from "../dev-telemetry";
import type { ChatThread, ChatThreadSummary } from "../types/threads";

const BASE_URL = import.meta.env.VITE_SERVER_URL || "";
const devFetch = getDevFetch();

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return (await response.json()) as Record<string, unknown>;
  }
  const text = await response.text();
  return text ? { error: text } : {};
}

function base(projectId: string) {
  return `${BASE_URL.replace(/\/$/, "")}/api/projects/${projectId}`;
}

export async function getActiveThread(
  projectId: string,
  fileId: string,
): Promise<ChatThread | null> {
  const response = await devFetch(`${base(projectId)}/files/${fileId}/threads/active`, {
    credentials: "include",
  });
  if (response.status === 204) return null;
  const data = await readJson(response);
  if (!response.ok) throw new Error((data.error as string) ?? "Could not load chat.");
  return data.thread as ChatThread;
}

export async function createThread(
  projectId: string,
  fileId: string,
  title?: string,
): Promise<ChatThreadSummary> {
  const response = await devFetch(`${base(projectId)}/files/${fileId}/threads`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error((data.error as string) ?? "Could not start a new chat.");
  return data.thread as ChatThreadSummary;
}

export async function appendThreadMessages(
  projectId: string,
  threadId: string,
  messages: { clientId: string; role: "user" | "assistant"; parts: unknown[] }[],
): Promise<{ seq: number; clientId: string }[]> {
  const response = await devFetch(`${base(projectId)}/threads/${threadId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error((data.error as string) ?? "Could not save chat.");
  return data.messages as { seq: number; clientId: string }[];
}
