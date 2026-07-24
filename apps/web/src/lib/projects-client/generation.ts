import { env } from "@OpenDiagram/env/web";
import { consumeSSE, pollUntilTerminal } from "../sse";
import { projectResponseError, readProjectResponse } from "./http";
import type { RepoGenerationJob } from "./types";

export async function startRepoGeneration(projectId: string): Promise<RepoGenerationJob> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/repo-generation`,
    { method: "POST", credentials: "include" },
  );
  const data = await readProjectResponse(response);
  if (!response.ok)
    throw projectResponseError(data, "Could not start repository generation.", response.status);
  return data.job;
}

export async function streamRepoGeneration(
  projectId: string,
  onJob: (job: RepoGenerationJob) => void,
  signal?: AbortSignal,
): Promise<RepoGenerationJob> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/repo-generation`,
    { method: "POST", credentials: "include", signal },
  );

  if (!response.ok) {
    const data = await readProjectResponse(response);
    throw projectResponseError(data, "Could not start repository generation.", response.status);
  }

  let last = await consumeSSE<RepoGenerationJob>(response, onJob);
  if (!last) throw new Error("Repository generation stream ended unexpectedly.");

  if (last.status !== "done" && last.status !== "failed") {
    const jobId = last.id;
    last = await pollUntilTerminal(
      () => getRepoGenerationJob(projectId, jobId),
      (job) => job.status === "done" || job.status === "failed",
      onJob,
      { signal },
    );
  }

  return last;
}

export async function getRepoGenerationJob(
  projectId: string,
  jobId: string,
): Promise<RepoGenerationJob> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/repo-generation/${jobId}`,
    { credentials: "include" },
  );
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load repository generation job.");
  return data.job;
}
