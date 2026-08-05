import { env } from "@OpenDiagram/env/web";
import { readProjectResponse } from "./http";
import type { CreateProjectFileInput, SavedProjectFile, UpdateProjectFileInput } from "./types";

export async function listProjectFiles(projectId: string): Promise<SavedProjectFile[]> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load project files.");
  return data.files;
}

export async function getProjectFile(projectId: string, fileId: string): Promise<SavedProjectFile> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files/${fileId}`,
    { credentials: "include" },
  );
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load project file.");
  return data.file;
}

export async function createProjectFile(
  projectId: string,
  input: CreateProjectFileInput,
): Promise<SavedProjectFile> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not save project file.");
  return data.file;
}

export async function updateProjectFile(
  projectId: string,
  fileId: string,
  input: UpdateProjectFileInput,
  // `meta` asks the server to leave the content columns out of the response. Use
  // it from any caller that ignores the return value beyond `updatedAt` -- the
  // full form ships the scene back down on every autosave. Callers that do
  // `setActiveFile(updated)` must stay on "full" or they will blank the editor.
  fields: "full" | "meta" = "full",
): Promise<SavedProjectFile> {
  const query = fields === "meta" ? "?fields=meta" : "";
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files/${fileId}${query}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not save project file.");
  return data.file;
}

export async function deleteProjectFile(projectId: string, fileId: string): Promise<void> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files/${fileId}`,
    { method: "DELETE", credentials: "include" },
  );
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not delete project file.");
}
