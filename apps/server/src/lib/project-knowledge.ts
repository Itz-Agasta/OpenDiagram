import {
  createProjectDataset,
  deleteCogneeDataset,
  ensureCogneeDataset,
  getDatasetStats,
  hasDatasetDocuments,
  replaceDatasetDocuments,
  searchDataset,
  type CogneeDocument,
  type CogneeSearchResult,
} from "@OpenDiagram/cognee";
import { and, db, desc, eq } from "@OpenDiagram/db";
import { project } from "@OpenDiagram/db/schema/project";
import { projectFile } from "@OpenDiagram/db/schema/project-file";

const MAX_DOCUMENT_CHARS = 16_000;

export type ProjectCogneeStatus = {
  datasetId: string | null;
  status: string;
  error: string | null;
  documentCount: number;
  updatedAt: string | null;
};

export async function ensureProjectKnowledgeDataset(input: { projectId: string; userId: string }) {
  const row = await getOwnedProject(input);
  if (!row) return null;
  if (row.cogneeDatasetId) return row.cogneeDatasetId;

  try {
    const datasetName = createProjectDataset(input.projectId);
    const dataset = await ensureCogneeDataset(datasetName);

    await db
      .update(project)
      .set({ cogneeDatasetId: dataset.id, cogneeStatus: "pending", cogneeError: null })
      .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

    return dataset.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create Cognee dataset.";
    await db
      .update(project)
      .set({ cogneeStatus: "failed", cogneeError: message })
      .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

    return null;
  }
}

export async function getProjectCogneeStatus(input: {
  projectId: string;
  userId: string;
}): Promise<ProjectCogneeStatus | null> {
  const row = await getOwnedProject(input);
  if (!row) return null;

  const datasetName = createProjectDataset(input.projectId);
  const stats = row.cogneeDatasetId
    ? getDatasetStats(datasetName)
    : { documentCount: 0, updatedAt: null };

  return {
    datasetId: row.cogneeDatasetId,
    status: row.cogneeStatus,
    error: row.cogneeError,
    documentCount: stats.documentCount,
    updatedAt: stats.updatedAt,
  };
}

export async function reindexProjectKnowledge(input: { projectId: string; userId: string }) {
  const row = await getOwnedProject(input);
  if (!row) return null;

  if (row.cogneeDatasetId) {
    await deleteCogneeDataset(row.cogneeDatasetId);
  }

  const datasetName = createProjectDataset(input.projectId);

  await db
    .update(project)
    .set({ cogneeStatus: "ingesting", cogneeError: null })
    .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

  try {
    const documents = await buildProjectKnowledgeDocuments(input.projectId, row);
    const cogneeUuid = await replaceDatasetDocuments(datasetName, documents);

    await db
      .update(project)
      .set({
        cogneeDatasetId: cogneeUuid ?? datasetName,
        cogneeStatus: "ready",
        cogneeError: null,
      })
      .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

    return {
      datasetId: cogneeUuid ?? datasetName,
      status: "ready",
      error: null,
      ...getDatasetStats(datasetName),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project knowledge indexing failed.";
    await db
      .update(project)
      .set({ cogneeStatus: "failed", cogneeError: message })
      .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

    throw error;
  }
}

export async function searchProjectKnowledge(input: {
  projectId: string;
  userId: string;
  query: string;
}): Promise<CogneeSearchResult[] | null> {
  const row = await getOwnedProject(input);
  if (!row) return null;

  const datasetName = createProjectDataset(input.projectId);
  let cogneeDatasetId = row.cogneeDatasetId;

  if (!row.cogneeDatasetId || row.cogneeStatus !== "ready" || !hasDatasetDocuments(datasetName)) {
    const status = await reindexProjectKnowledge(input);
    cogneeDatasetId = status?.datasetId ?? cogneeDatasetId;
  }

  return searchDataset(datasetName, input.query, 8, cogneeDatasetId);
}

async function getOwnedProject(input: { projectId: string; userId: string }) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.userId, input.userId)));

  return row ?? null;
}

async function buildProjectKnowledgeDocuments(
  projectId: string,
  projectRow: NonNullable<Awaited<ReturnType<typeof getOwnedProject>>>,
): Promise<CogneeDocument[]> {
  const files = await db
    .select()
    .from(projectFile)
    .where(eq(projectFile.projectId, projectId))
    .orderBy(desc(projectFile.updatedAt));

  const documents: CogneeDocument[] = [
    {
      id: `${projectId}:overview`,
      title: `Project overview: ${projectRow.name}`,
      sourceType: "project",
      content: [
        `Name: ${projectRow.name}`,
        projectRow.description ? `Description: ${projectRow.description}` : null,
        projectRow.spec ? `Project spec: ${unknownToText(projectRow.spec)}` : null,
        projectRow.scene ? `Project scene: ${unknownToText(projectRow.scene)}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      metadata: { projectId },
    },
  ];

  for (const file of files) {
    documents.push({
      id: `${projectId}:file:${file.id}`,
      title: `${file.name} (${file.type})`,
      sourceType: "project_file",
      content: [
        `File name: ${file.name}`,
        `File type: ${file.type}`,
        file.spec ? `Spec: ${unknownToText(file.spec)}` : null,
        file.scene ? `Scene: ${unknownToText(file.scene)}` : null,
        file.content ? `Content: ${unknownToText(file.content)}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      metadata: { projectId, fileId: file.id, fileType: file.type },
    });
  }

  return documents.filter((document) => document.content.trim().length > 0);
}

function unknownToText(value: unknown) {
  if (typeof value === "string") return truncate(value);

  try {
    return truncate(JSON.stringify(value, null, 2));
  } catch {
    return "[Unserializable project data]";
  }
}

function truncate(value: string) {
  return value.length > MAX_DOCUMENT_CHARS
    ? `${value.slice(0, MAX_DOCUMENT_CHARS)}\n[truncated]`
    : value;
}
