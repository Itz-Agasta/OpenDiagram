import { env } from "@OpenDiagram/env/web";
import { readAiProviderUsage } from "../ai-provider-usage";
import { projectResponseError, readProjectResponse } from "./http";
import type { ProjectChatResult } from "./types";

export async function chatWithProject(
  projectId: string,
  message: string,
  providerId?: string,
  modelId?: string,
  signal?: AbortSignal,
): Promise<ProjectChatResult> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, modelId, providerId }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000),
  });
  const data = await readProjectResponse(response);
  if (!response.ok)
    throw projectResponseError(data, "Could not ask project assistant.", response.status);

  return { ...data, aiProvider: readAiProviderUsage(response) ?? undefined };
}
