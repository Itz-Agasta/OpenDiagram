export interface Project {
  id: string;
  name: string;
  description: string | null;
  source?: string | null;
  sourceMetadata?: unknown | null;
  generationStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  source?: "manual" | "github_import";
  sourceMetadata?: unknown;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  type: "diagram" | "doc";
  name: string;
  createdAt: string;
  updatedAt: string;
}
