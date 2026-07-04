import { env } from "@OpenDiagram/env/web";

export type SavedProject = {
  id: string;
  name: string;
  description: string | null;
  cogneeDatasetId?: string | null;
  cogneeStatus?: string;
  cogneeError?: string | null;
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
  history?: unknown[];
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
  history?: unknown[];
};

export type UpdateProjectFileInput = Partial<CreateProjectFileInput>;

export type ProjectChatSource = {
  id: string;
  title: string;
  sourceType: string;
  excerpt: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type ProjectChatResult = {
  answer: string;
  sources: ProjectChatSource[];
};

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
    {
      credentials: "include",
    },
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

export type ProjectContextResult = {
  context: string;
  sources: ProjectChatSource[];
};

export async function getProjectContext(
  projectId: string,
  query: string,
): Promise<ProjectContextResult> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/cognee/context`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not get project context.");
  }

  return data;
}

export async function chatWithProject(
  projectId: string,
  message: string,
): Promise<ProjectChatResult> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not ask project assistant.");
  }

  return data;
}
