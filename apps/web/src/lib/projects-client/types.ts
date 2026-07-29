import type { AiProviderUsage } from "../ai-provider-usage";

export type SavedProject = {
  id: string;
  name: string;
  description: string | null;
  source: "manual" | "github_import";
  sourceMetadata?: unknown;
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
  provider?: "local";
  aiProvider?: AiProviderUsage;
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

export type CreationQuota = {
  actorType: "guest" | "user";
  limit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
  /** Credits signing up is worth, for the guest upsell. From the plan table. */
  signupCredits?: number;
};
