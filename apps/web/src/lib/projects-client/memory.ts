import { env } from "@OpenDiagram/env/web";
import { readAiProviderUsage } from "../ai-provider-usage";
import { projectResponseError, readProjectResponse } from "./http";
import type { ProjectChatResult, ProjectMemoryContextResult, ProjectMemoryStatus } from "./types";

export async function getProjectMemoryStatus(projectId: string): Promise<ProjectMemoryStatus> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/memory/status`,
    { credentials: "include" },
  );
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load project memory status.");
  return data.memory;
}

export async function reindexProjectMemory(projectId: string): Promise<ProjectMemoryStatus> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/memory/reindex`,
    { method: "POST", credentials: "include" },
  );
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not index project memory.");
  return data.memory;
}

export async function getProjectContext(
  projectId: string,
  query: string,
): Promise<ProjectMemoryContextResult> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/memory/context`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not get project context.");
  return data;
}

export async function chatWithProject(
  projectId: string,
  message: string,
  providerId?: string,
  modelId?: string,
): Promise<ProjectChatResult> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, modelId, providerId }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw projectResponseError(data, "Could not ask project assistant.");

  return { ...data, aiProvider: readAiProviderUsage(response) ?? undefined };
}
