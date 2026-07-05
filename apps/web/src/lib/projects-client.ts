import { env } from "@OpenDiagram/env/web";

export type SavedProject = {
  id: string;
  name: string;
  description: string | null;
  source: "manual" | "github_import";
  sourceMetadata?: unknown;
  memoryDatasetId?: string | null;
  memoryStatus?: string;
  memoryError?: string | null;
  generationStatus?: "none" | "queued" | "planning" | "creating" | "generating" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type ProjectFileType = "diagram" | "doc";

export type RepositoryDocProvenance = {
  kind: "repo_documentation";
  generated: true;
  generatorVersion: "repo-doc-stub-v1";
  repoFullName: string;
  branch: string;
  commitSha: string | null;
  importedAt: string;
  sourcePaths: string[];
  userEditedAt: string | null;
};

export type SavedProjectFile = {
  id: string;
  projectId: string;
  type: ProjectFileType;
  name: string;
  scene?: unknown;
  spec?: RepositoryDocProvenance | unknown;
  content?: unknown;
  history?: unknown[];
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
  source?: "manual" | "github_import";
  sourceMetadata?: unknown;
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
  provider?: "cognee" | "local";
};

export type ProjectMemoryContextResult = {
  context: string;
  sources: ProjectChatSource[];
  provider: "cognee" | "local";
};

export type ProjectMemoryStatus = {
  provider: string;
  status: string;
  datasetId: string | null;
  datasetName: string;
  error: string | null;
  health?: { ok: boolean; disabled: boolean } | null;
};

export type RepoGenerationTask = {
  id: string;
  type: ProjectFileType;
  name: string;
  goal: string;
  status: "pending" | "active" | "complete" | "failed";
  message: string;
  fileId: string | null;
};

export type RepoGenerationJob = {
  id: string;
  projectId: string;
  status: "queued" | "planning" | "creating" | "generating" | "done" | "failed";
  message: string;
  error: string | null;
  tasks: RepoGenerationTask[];
  createdFiles: Array<{ id: string; name: string; type: ProjectFileType }>;
  createdAt: string;
  updatedAt: string;
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

export async function getProjectMemoryStatus(projectId: string): Promise<ProjectMemoryStatus> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/memory/status`,
    {
      credentials: "include",
    },
  );
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load project memory status.");
  }

  return data.memory;
}

export async function startRepoGeneration(projectId: string): Promise<RepoGenerationJob> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/repo-generation`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not start repository generation.");
  }

  return data.job;
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

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load repository generation job.");
  }

  return data.job;
}

export async function reindexProjectMemory(projectId: string): Promise<ProjectMemoryStatus> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/memory/reindex`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  const data = await readProjectResponse(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not index project memory.");
  }

  return data.memory;
}

export async function getProjectContext(
  projectId: string,
  query: string,
): Promise<ProjectMemoryContextResult> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/memory/context`,
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
