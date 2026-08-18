import { queryOptions } from "@tanstack/react-query";
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFile,
  CreateProjectFileInput,
  UpdateProjectFileInput,
} from "../types";
import { getDevFetch } from "../dev-telemetry";

const BASE_URL = import.meta.env.VITE_SERVER_URL || "";
const devFetch = getDevFetch();

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await devFetch(url, {
    credentials: "include",
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: string };
    const errorMsg = errorData.error || `HTTP error! status: ${response.status}`;
    throw new Error(errorMsg);
  }

  return response.json() as Promise<T>;
}

// Fetch endpoints
export async function fetchProjects(): Promise<Project[]> {
  const data = await apiFetch<{ projects: Project[] }>("/api/projects");
  return data.projects;
}

export async function fetchProject(id: string): Promise<Project> {
  const data = await apiFetch<{ project: Project }>(`/api/projects/${id}`);
  return data.project;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const data = await apiFetch<{ project: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.project;
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  const data = await apiFetch<{ project: Project }>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/projects/${id}`, {
    method: "DELETE",
  });
}

// Query Options for React Query
export const projectsQueryOptions = queryOptions({
  queryKey: ["projects"],
  queryFn: fetchProjects,
});

export const projectQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["projects", id],
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });

export async function fetchProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const data = await apiFetch<{ files: ProjectFile[] }>(`/api/projects/${projectId}/files`);
  return data.files;
}

export const projectFilesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "files"],
    queryFn: () => fetchProjectFiles(projectId),
    enabled: !!projectId,
  });

export async function fetchProjectFile(projectId: string, fileId: string): Promise<ProjectFile> {
  const data = await apiFetch<{ file: ProjectFile }>(`/api/projects/${projectId}/files/${fileId}`);
  return data.file;
}

export const projectFileQueryOptions = (projectId: string, fileId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "files", fileId],
    queryFn: () => fetchProjectFile(projectId, fileId),
    enabled: !!projectId && !!fileId,
  });

export async function createProjectFile(
  projectId: string,
  input: CreateProjectFileInput,
): Promise<ProjectFile> {
  const data = await apiFetch<{ file: ProjectFile }>(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.file;
}

export async function updateProjectFile(
  projectId: string,
  fileId: string,
  input: UpdateProjectFileInput,
  fields: "full" | "meta" = "full",
): Promise<ProjectFile> {
  const query = fields === "meta" ? "?fields=meta" : "";
  const data = await apiFetch<{ file: ProjectFile }>(
    `/api/projects/${projectId}/files/${fileId}${query}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return data.file;
}

export async function deleteProjectFile(projectId: string, fileId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/projects/${projectId}/files/${fileId}`, {
    method: "DELETE",
  });
}
