import { and, db, desc, eq, ne } from "@OpenDiagram/db";
import { projectFile } from "@OpenDiagram/db/schema/project-file";
import { project } from "@OpenDiagram/db/schema/project";
import {
  CogneeApiError,
  checkCogneeHealth,
  createCogneeDataset,
  deleteCogneeDataset,
  isCogneeConfigured,
  rememberCogneeDocuments,
  searchCognee,
} from "./cognee-client";
import type { RepositorySourceDocument } from "./repo-documentation";

const MAX_DOCUMENT_CHARS = 16_000;
const MAX_CONTEXT_CHARS = 16_000;

type ProjectMemoryStatus = typeof project.$inferSelect.memoryStatus;

const ARCHITECTURE_EXTRACTION_PROMPT = [
  "Extract software architecture knowledge from this OpenDiagram project.",
  "Prioritize systems, services, data stores, APIs, dependencies, protocols, constraints, requirements, and architecture decisions.",
  "Preserve relationships between components and decisions that explain why the architecture is shaped this way.",
].join(" ");

const REPOSITORY_EXTRACTION_PROMPT = [
  "Extract software architecture knowledge from this source repository.",
  "Prioritize entry points, frameworks, routes, APIs, packages, data models, services, dependencies, deployment config, and key control flow.",
  "Preserve source file paths and relationships so downstream agents can cite files when generating docs and diagrams.",
].join(" ");

export type ProjectMemorySource = {
  id: string;
  title: string;
  sourceType: string;
  excerpt: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type ProjectMemoryContext = {
  context: string;
  sources: ProjectMemorySource[];
  provider: "cognee" | "local";
};

export async function getProjectMemoryStatus(input: { projectId: string; userId: string }) {
  const row = await getOwnedProject(input);
  if (!row) return null;

  if (!isCogneeConfigured()) {
    return {
      provider: "cognee",
      status: "disabled",
      datasetId: row.memoryDatasetId,
      datasetName: createProjectDatasetName(input.projectId),
      error: "Set COGNEE_BASE_URL and COGNEE_API_KEY to enable project memory.",
      health: { ok: false, disabled: true },
    };
  }

  let health: Awaited<ReturnType<typeof checkCogneeHealth>> | null = null;
  try {
    health = await checkCogneeHealth();
  } catch (error) {
    health = { ok: false, disabled: false };
    await setProjectMemoryState(input, {
      status: "failed",
      error: error instanceof Error ? error.message : "Cognee health check failed.",
    });
  }

  const latest = await getOwnedProject(input);

  return {
    provider: "cognee",
    status: latest?.memoryStatus ?? row.memoryStatus,
    datasetId: latest?.memoryDatasetId ?? row.memoryDatasetId,
    datasetName: createProjectDatasetName(input.projectId),
    error: latest?.memoryError ?? row.memoryError,
    health,
  };
}

export async function reindexProjectMemory(input: { projectId: string; userId: string }) {
  const row = await getOwnedProject(input);
  if (!row) return null;

  if (!isCogneeConfigured()) {
    return {
      provider: "cognee",
      status: "disabled",
      datasetId: row.memoryDatasetId,
      datasetName: createProjectDatasetName(input.projectId),
      error: "Set COGNEE_BASE_URL and COGNEE_API_KEY to enable project memory.",
    };
  }

  const lockedRow = await acquireProjectMemoryIngestLock(input);
  if (!lockedRow) {
    return {
      provider: "cognee",
      status: "ingesting",
      datasetId: row.memoryDatasetId,
      datasetName: createProjectDatasetName(input.projectId),
      error: "Project memory indexing is already running.",
    };
  }

  try {
    if (lockedRow.memoryDatasetId) {
      await deleteCogneeDataset(lockedRow.memoryDatasetId).catch((error) => {
        if (error instanceof CogneeApiError && [403, 404].includes(error.status)) return;
        throw error;
      });
    }

    const datasetName = createProjectDatasetName(input.projectId);
    const dataset = await createCogneeDataset(datasetName);
    const documents = await buildProjectDocuments(input.projectId, lockedRow);
    const remembered = await rememberCogneeDocuments({
      datasetId: dataset.id,
      documents,
      nodeSet: `project:${input.projectId}`,
      customPrompt: ARCHITECTURE_EXTRACTION_PROMPT,
      runInBackground: false,
    });

    const datasetId = remembered.dataset_id ?? dataset.id;

    await setProjectMemoryState(input, {
      datasetId,
      status: "ready",
      error: null,
    });

    return {
      provider: "cognee",
      status: "ready",
      datasetId,
      datasetName,
      error: null,
      itemsProcessed: remembered.items_processed ?? documents.length,
      pipelineRunId: remembered.pipeline_run_id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project memory indexing failed.";
    await setProjectMemoryState(input, { status: "failed", error: message });
    throw error;
  }
}

export async function indexRepositoryMemory(input: {
  projectId: string;
  userId: string;
  repoFullName: string;
  branch: string;
  commitSha: string | null;
  repoPath: string;
  sourceDocuments: RepositorySourceDocument[];
}) {
  const row = await getOwnedProject(input);
  if (!row) return null;

  if (!isCogneeConfigured()) {
    await setProjectMemoryState(input, {
      status: "not_started",
      error: "Set COGNEE_BASE_URL and COGNEE_API_KEY to enable repository memory.",
    });

    return {
      provider: "cognee",
      status: "disabled",
      datasetId: row.memoryDatasetId,
      datasetName: createProjectDatasetName(input.projectId),
      error: "Set COGNEE_BASE_URL and COGNEE_API_KEY to enable repository memory.",
    };
  }

  const lockedRow = await acquireProjectMemoryIngestLock(input);
  if (!lockedRow) {
    return {
      provider: "cognee",
      status: "ingesting",
      datasetId: row.memoryDatasetId,
      datasetName: createProjectDatasetName(input.projectId),
      error: "Repository memory indexing is already running.",
    };
  }

  try {
    if (lockedRow.memoryDatasetId) {
      await deleteCogneeDataset(lockedRow.memoryDatasetId).catch((error) => {
        if (error instanceof CogneeApiError && [403, 404].includes(error.status)) return;
        throw error;
      });
    }

    const datasetName = createProjectDatasetName(input.projectId);
    const dataset = await createCogneeDataset(datasetName);
    const documents = buildRepositoryDocuments(input);
    const remembered = await rememberCogneeDocuments({
      datasetId: dataset.id,
      documents,
      nodeSet: `repo:${input.repoFullName}:${input.commitSha ?? input.branch}`,
      customPrompt: REPOSITORY_EXTRACTION_PROMPT,
      runInBackground: false,
    });
    const datasetId = remembered.dataset_id ?? dataset.id;

    await setProjectMemoryState(input, {
      datasetId,
      status: "ready",
      error: null,
    });

    return {
      provider: "cognee",
      status: "ready",
      datasetId,
      datasetName,
      error: null,
      itemsProcessed: remembered.items_processed ?? documents.length,
      pipelineRunId: remembered.pipeline_run_id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repository memory indexing failed.";
    await setProjectMemoryState(input, { status: "failed", error: message });
    throw error;
  }
}

export async function getProjectMemoryContext(input: {
  projectId: string;
  userId: string;
  query: string;
}): Promise<ProjectMemoryContext | null> {
  const row = await getOwnedProject(input);
  if (!row) return null;

  if (!isCogneeConfigured() || row.memoryStatus !== "ready" || !row.memoryDatasetId) {
    return buildLocalProjectContext(input.projectId, input.userId);
  }

  try {
    const results = await searchCognee({
      datasetIds: [row.memoryDatasetId],
      query: input.query,
      searchType: "GRAPH_COMPLETION",
      onlyContext: true,
      includeReferences: true,
      topK: 8,
    });
    const context = extractCogneeContext(results);

    if (!context) return buildLocalProjectContext(input.projectId, input.userId);

    return {
      context: truncate(context, MAX_CONTEXT_CHARS),
      sources: results.map((result, index) => ({
        id: result.dataset_id ?? `${row.memoryDatasetId}:${index}`,
        title: result.dataset_name ?? createProjectDatasetName(input.projectId),
        sourceType: "cognee",
        excerpt: truncate(String(result.search_result ?? ""), MAX_CONTEXT_CHARS),
        score: 1,
        metadata: { projectId: input.projectId, datasetId: result.dataset_id },
      })),
      provider: "cognee",
    };
  } catch (error) {
    if (error instanceof CogneeApiError && error.status === 422) {
      await setProjectMemoryState(input, { status: "not_ready", error: error.message });
    }
    return buildLocalProjectContext(input.projectId, input.userId);
  }
}

export async function buildLocalProjectContext(
  projectId: string,
  userId: string,
): Promise<ProjectMemoryContext | null> {
  const row = await getOwnedProject({ projectId, userId });
  if (!row) return null;

  const files = await getProjectFiles(projectId);
  const sources: ProjectMemorySource[] = [
    {
      id: row.id,
      title: `Project: ${row.name}`,
      sourceType: "project",
      excerpt: row.description ?? "Project overview",
      score: 1,
      metadata: { projectId },
    },
    ...files.map((file) => ({
      id: file.id,
      title: file.name,
      sourceType: file.type,
      excerpt: summarizeFile(file),
      score: 1,
      metadata: { projectId, fileId: file.id },
    })),
  ];

  return {
    context: truncate(
      [projectToMarkdown(row), ...files.map(fileToMarkdown)].join("\n\n"),
      MAX_CONTEXT_CHARS,
    ),
    sources,
    provider: "local",
  };
}

export async function markProjectMemoryPending(projectId: string, userId: string) {
  await setProjectMemoryState({ projectId, userId }, { status: "pending", error: null });
}

function createProjectDatasetName(projectId: string) {
  return `opendiagram_project_${projectId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

async function getOwnedProject(input: { projectId: string; userId: string }) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

  return row ?? null;
}

async function getProjectFiles(projectId: string) {
  return db
    .select()
    .from(projectFile)
    .where(eq(projectFile.projectId, projectId))
    .orderBy(desc(projectFile.updatedAt));
}

async function acquireProjectMemoryIngestLock(input: { projectId: string; userId: string }) {
  const [row] = await db
    .update(project)
    .set({ memoryStatus: "ingesting", memoryError: null })
    .where(
      and(
        eq(project.id, input.projectId),
        eq(project.userId, input.userId),
        ne(project.memoryStatus, "ingesting"),
      ),
    )
    .returning();

  return row ?? null;
}

async function buildProjectDocuments(
  projectId: string,
  projectRow: NonNullable<Awaited<ReturnType<typeof getOwnedProject>>>,
) {
  const files = await getProjectFiles(projectId);
  return [
    { name: "project-overview.md", content: projectToMarkdown(projectRow) },
    ...files.map((file) => ({
      name: safeFileName(`${file.name}-${file.id}.md`),
      content: fileToMarkdown(file),
    })),
  ].filter((document) => document.content.trim().length > 0);
}

function buildRepositoryDocuments(input: {
  repoFullName: string;
  branch: string;
  commitSha: string | null;
  repoPath: string;
  sourceDocuments: RepositorySourceDocument[];
}) {
  return [
    {
      name: "repository-manifest.md",
      content: [
        `# Repository: ${input.repoFullName}`,
        "",
        `Branch: ${input.branch}`,
        `Commit: ${input.commitSha ?? "unknown"}`,
        `Clone path: ${input.repoPath}`,
        `Indexed source files: ${input.sourceDocuments.length}`,
        "",
        "## Source files",
        ...input.sourceDocuments.map((document) => `- ${document.path} (${document.bytes} bytes)`),
      ].join("\n"),
    },
    ...input.sourceDocuments.map((document) => ({
      name: document.name,
      content: document.content,
    })),
  ].filter((document) => document.content.trim().length > 0);
}

async function setProjectMemoryState(
  input: { projectId: string; userId: string },
  values: { datasetId?: string | null; status?: ProjectMemoryStatus; error?: string | null },
) {
  const update: Partial<typeof project.$inferInsert> = {};
  if ("datasetId" in values) update.memoryDatasetId = values.datasetId;
  if ("status" in values) update.memoryStatus = values.status;
  if ("error" in values) update.memoryError = values.error;

  await db
    .update(project)
    .set(update)
    .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));
}

function projectToMarkdown(row: typeof project.$inferSelect) {
  return [
    `# Project: ${row.name}`,
    row.description ? `Description: ${row.description}` : null,
    row.spec ? `## Project spec\n${unknownToText(row.spec)}` : null,
    row.scene ? `## Project scene\n${unknownToText(row.scene)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function fileToMarkdown(file: typeof projectFile.$inferSelect) {
  return [
    `# File: ${file.name}`,
    `Type: ${file.type}`,
    file.spec ? `## Spec\n${unknownToText(file.spec)}` : null,
    file.scene ? `## Scene\n${unknownToText(file.scene)}` : null,
    file.content ? `## Content\n${unknownToText(file.content)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function summarizeFile(file: typeof projectFile.$inferSelect) {
  return truncate(
    [file.spec, file.scene, file.content]
      .filter((value) => value != null)
      .map(unknownToText)
      .join("\n\n") || `${file.type} file`,
    MAX_CONTEXT_CHARS,
  );
}

function extractCogneeContext(results: Array<{ search_result: unknown }>) {
  return results
    .map((result) =>
      typeof result.search_result === "string"
        ? result.search_result
        : JSON.stringify(result.search_result),
    )
    .filter(Boolean)
    .join("\n\n");
}

function unknownToText(value: unknown) {
  if (typeof value === "string") return truncate(value, MAX_DOCUMENT_CHARS);

  try {
    return truncate(JSON.stringify(value, null, 2), MAX_DOCUMENT_CHARS);
  } catch {
    return "[Unserializable project data]";
  }
}

function truncate(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n[truncated]` : value;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 180);
}
