import { env } from "@OpenDiagram/env/web";
import { readProjectResponse } from "./http";
import type { CreateProjectInput, SavedProject } from "./types";

export async function listProjects(): Promise<SavedProject[]> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);
  if (!response.ok) throw new Error(data?.error ?? "Could not load projects.");
  return data.projects;
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
