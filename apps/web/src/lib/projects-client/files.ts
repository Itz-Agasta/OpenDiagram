import { env } from "@OpenDiagram/env/web";
import { encodeScene, resetSceneDelta, seedSceneDelta } from "@/lib/scene-delta";
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
  // The one place that sees a whole server-side scene, so the one place that can
  // seed the delta baseline for the next save.
  seedSceneDelta(fileId, data.file?.scene, data.file?.sceneRev);
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
  // meta asks the server to leave the content columns out of the response. Use it
  // from any caller that ignores the return value beyond updatedAt; the full form
  // ships the scene back down on every autosave. Callers that do
  // setActiveFile(updated) must stay on full or they will blank the editor.
  fields: "full" | "meta" = "full",
): Promise<SavedProjectFile> {
  return sendProjectFileUpdate(projectId, fileId, input, fields, true);
}

async function sendProjectFileUpdate(
  projectId: string,
  fileId: string,
  input: UpdateProjectFileInput,
  fields: "full" | "meta",
  mayRetry: boolean,
): Promise<SavedProjectFile> {
  // A whole scene goes out as a delta of the elements whose version moved, when
  // the server's revision is known.
  const encoded = input.scene !== undefined ? encodeScene(fileId, input.scene) : null;
  const query = fields === "meta" ? "?fields=meta" : "";
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files/${fileId}${query}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(encoded ? { ...input, scene: encoded.wire } : input),
    },
  );

  // Delta built against a revision the server has moved past (another tab or
  // device wrote in between). Drop the baseline so the retry carries the whole
  // scene (last-writer-wins). Retry once: a second 409 means something is writing
  // faster than we can respond, and looping is worse than surfacing it.
  if (response.status === 409 && mayRetry) {
    resetSceneDelta(fileId);
    return sendProjectFileUpdate(projectId, fileId, input, fields, false);
  }

  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not save project file.");
  encoded?.commit(data.file?.sceneRev);
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
