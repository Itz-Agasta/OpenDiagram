import { env } from "@OpenDiagram/env/web";

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
  repoFullName: string;
  defaultBranch: string;
  importedAt: string;
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

export async function importGitHubRepository(repoFullName: string): Promise<ImportedGitHubProject> {
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

  return data.project;
}
