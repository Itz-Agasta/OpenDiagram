import { env } from "@OpenDiagram/env/web";
import { consumeSSE } from "./sse";

export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
};

export type ImportedGitHubProject = {
  id: string;
  name: string;
};

export type GitHubImportJob = {
  id: string;
  repoFullName: string;
  status: "queued" | "cloning" | "documenting" | "indexing" | "done" | "failed";
  message: string;
  error: string | null;
  project: ImportedGitHubProject | null;
  createdAt: string;
  updatedAt: string;
};

export async function listGitHubRepositories(): Promise<GitHubRepository[]> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/github/repositories`, {
    credentials: "include",
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load GitHub repositories.");
  }

  return data.repositories;
}

export async function importGitHubRepository(repoFullName: string): Promise<GitHubImportJob> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/import/github`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoFullName }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not import GitHub repository.");
  }

  return data.job;
}

// Streams the import: the POST runs the whole job server-side and pushes a
// status event per step. Resolves with the terminal job. Falls back callers to
// getGitHubImportJob for reconnects.
export async function importGitHubRepositoryStream(
  repoFullName: string,
  onStatus: (job: GitHubImportJob) => void,
  signal?: AbortSignal,
): Promise<GitHubImportJob> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/import/github`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoFullName }),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Could not import GitHub repository.");
  }

  const last = await consumeSSE<GitHubImportJob>(response, onStatus);
  if (!last) throw new Error("Import stream ended unexpectedly.");
  if (last.status === "failed") throw new Error(last.error ?? "Repository import failed.");
  return last;
}

export async function getGitHubImportJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<GitHubImportJob> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/import/github/${jobId}`, {
    credentials: "include",
    signal,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load import status.");
  }

  return data.job;
}
