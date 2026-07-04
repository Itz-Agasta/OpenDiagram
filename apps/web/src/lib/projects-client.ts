import { env } from "@OpenDiagram/env/web";

export type SavedProject = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFileType = "diagram" | "doc" | "readme" | "imported_repo" | "ai_diagram";

export type SavedProjectFile = {
  id: string;
  projectId: string;
  type: ProjectFileType;
  name: string;
  scene?: unknown;
  spec?: unknown;
  content?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
};

export type CreateProjectFileInput = {
  name: string;
  type: ProjectFileType;
  scene?: unknown;
  spec?: unknown;
  content?: unknown;
};

export type UpdateProjectFileInput = Partial<CreateProjectFileInput>;

async function readProjectResponse(response: Response) {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { error: text } : {};
}

export async function listProjects(): Promise<SavedProject[]> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load projects.");
  }

  return data.projects;
}

export async function getProject(id: string): Promise<SavedProject> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${id}`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load project.");
  }

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

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not save project.");
  }

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

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not rename project.");
  }

  return data.project;
}

export async function listProjectFiles(projectId: string): Promise<SavedProjectFile[]> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files`, {
    credentials: "include",
  });
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load project files.");
  }

  return data.files;
}

export async function getProjectFile(projectId: string, fileId: string): Promise<SavedProjectFile> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files/${fileId}`,
    { credentials: "include" },
  );
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load project file.");
  }

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

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not save project file.");
  }

  return data.file;
}

export async function updateProjectFile(
  projectId: string,
  fileId: string,
  input: UpdateProjectFileInput,
): Promise<SavedProjectFile> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files/${fileId}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not save project file.");
  }

  return data.file;
}
