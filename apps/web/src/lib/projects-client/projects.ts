import { env } from "@OpenDiagram/env/web";
import { readProjectResponse } from "./http";
import type { CreateProjectInput, SavedProject, SavedProjectFile } from "./types";

export type DashboardProjects = {
  projects: SavedProject[];
  filesByProject: Record<string, SavedProjectFile[]>;
};

export async function listProjects(): Promise<SavedProject[]> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load projects.");
  return data.projects;
}

/**
 * The whole dashboard tree in one request.
 *
 * The dashboard used to call `listProjects` and then `listProjectFiles` once per
 * project, so ten projects cost eleven round trips -- each re-resolving the
 * session and re-paying the network on its own. The server answers this with a
 * single left join instead.
 *
 * Returned pre-split into the two shapes the dashboard already keeps in state,
 * so the join stays an implementation detail of the transport rather than
 * something every consumer has to unpack.
 */
export async function listProjectsWithFiles(): Promise<DashboardProjects> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects?include=files`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load projects.");

  const rows: Array<SavedProject & { files?: SavedProjectFile[] }> = data.projects ?? [];

  return {
    projects: rows.map(({ files: _files, ...project }) => project),
    filesByProject: Object.fromEntries(rows.map((row) => [row.id, row.files ?? []])),
  };
}

export async function getProject(id: string): Promise<SavedProject> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${id}`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load project.");
  return data.project;
}

export async function createProject(input: CreateProjectInput): Promise<SavedProject> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not save project.");
  return data.project;
}

export async function updateProject(
  id: string,
  input: { name?: string; description?: string | null },
): Promise<SavedProject> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not rename project.");
  return data.project;
}
