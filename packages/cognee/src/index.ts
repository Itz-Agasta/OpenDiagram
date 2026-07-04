import { env } from "@OpenDiagram/env/server";

export type CogneeDocument = {
  id: string;
  title: string;
  content: string;
  sourceType: "project" | "project_file" | "github";
  metadata?: Record<string, string | number | boolean | null>;
};

export type CogneeSearchResult = {
  document: CogneeDocument;
  score: number;
  excerpt: string;
};

type StoredDataset = {
  documents: CogneeDocument[];
  updatedAt: Date;
};

type CogneeDataset = {
  id: string;
  name: string;
};

const datasets = new Map<string, StoredDataset>();

export function createProjectDataset(projectId: string) {
  const datasetName = `opendiagram_${projectId.replace(/[^a-z0-9]+/gi, "_")}`;

  if (!datasets.has(datasetName)) {
    datasets.set(datasetName, { documents: [], updatedAt: new Date() });
  }

  return datasetName;
}

export async function replaceDatasetDocuments(
  datasetName: string,
  documents: CogneeDocument[],
): Promise<string | null> {
  const dataset = await ensureCogneeDataset(datasetName);

  if (documents.length > 0) {
    await addDocuments(dataset.id, documents);
    await cognifyDataset(dataset.id);
  }

  datasets.set(datasetName, { documents, updatedAt: new Date() });
  return dataset.id;
}

export function listDatasets() {
  return cloudRequest<CogneeDataset[]>("/api/v1/datasets/", { method: "GET" });
}

export async function ensureCogneeDataset(datasetName: string) {
  const dataset = await cloudRequest<CogneeDataset>("/api/v1/datasets", {
    method: "POST",
    body: JSON.stringify({ name: datasetName }),
  });

  if (!dataset?.id || !dataset.name) {
    throw new Error("Cognee Cloud did not return a dataset id.");
  }

  return dataset;
}

export function hasDatasetDocuments(datasetName: string) {
  return (datasets.get(datasetName)?.documents.length ?? 0) > 0;
}

export function getDatasetStats(datasetName: string) {
  const dataset = datasets.get(datasetName);

  return {
    documentCount: dataset?.documents.length ?? 0,
    updatedAt: dataset?.updatedAt.toISOString() ?? null,
  };
}

export async function searchDataset(
  datasetName: string,
  query: string,
  limit = 8,
  datasetId?: string | null,
): Promise<CogneeSearchResult[]> {
  const response = await cloudRequest<Record<string, unknown>[]>("/api/v1/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      searchType: "CHUNKS",
      ...(datasetId && isUuid(datasetId)
        ? { datasetIds: [datasetId] }
        : { datasets: [datasetName] }),
      topK: limit,
    }),
  });

  const documents = datasets.get(datasetName)?.documents ?? [];

  return (response ?? []).slice(0, limit).map((entry, index) => {
    const text = entryToText(entry);
    const document =
      findBestDocument(documents, text) ?? documents[index] ?? createSearchDocument(datasetName);

    return {
      document,
      score: (entry.score as number) ?? limit - index,
      excerpt: text || document.content.slice(0, 420),
    };
  });
}

export async function deleteCogneeDataset(cogneeUuid: string) {
  try {
    if (isUuid(cogneeUuid)) {
      await cloudRequest(`/api/v1/datasets/${encodeURIComponent(cogneeUuid)}`, {
        method: "DELETE",
      });
      return;
    }

    await cloudRequest("/api/v1/forget", {
      method: "POST",
      body: JSON.stringify({ dataset: cogneeUuid }),
    });
  } catch (error) {
    if (error instanceof CogneeCloudError && [401, 403, 404, 405, 422].includes(error.status)) {
      return;
    }
    throw error;
  }
}

async function addDocuments(datasetId: string, documents: CogneeDocument[]) {
  const form = new FormData();
  form.set("datasetId", datasetId);
  form.set("run_in_background", "false");

  for (const document of documents) {
    form.append(
      "data",
      new File([formatDocumentForCognee(document)], `${safeFileName(document.id)}.md`, {
        type: "text/markdown",
      }),
    );
  }

  await cloudRequest("/api/v1/add", {
    method: "POST",
    body: form,
  });
}

async function cognifyDataset(datasetId: string) {
  await cloudRequest("/api/v1/cognify", {
    method: "POST",
    body: JSON.stringify({ datasetIds: [datasetId], runInBackground: false }),
  });
}

async function cloudRequest<T>(path: string, init: RequestInit): Promise<T> {
  const apiKey = env.COGNEE_CLOUD_API_KEY ?? env.COGNEE_API_KEY;
  const baseUrl = env.COGNEE_CLOUD_BASE_URL ?? env.COGNEE_BASE_URL;

  if (!apiKey) {
    throw new Error("COGNEE_API_KEY or COGNEE_CLOUD_API_KEY is required for Cognee Cloud.");
  }

  if (!baseUrl) {
    throw new Error("COGNEE_BASE_URL or COGNEE_CLOUD_BASE_URL is required for Cognee Cloud.");
  }

  const url = new URL(path, baseUrl);
  const method = init.method ?? "GET";
  let wasNetworkError = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(500 * 2 ** attempt + Math.random() * 500, 5000);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const headers = new Headers(init.headers);
      headers.set("X-Api-Key", apiKey);

      if (!(init.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(url, { ...init, headers });

      if (!response.ok) {
        if (response.status >= 500) {
          continue;
        }

        throw new CogneeCloudError(
          response.status,
          method,
          path,
          await readError(response),
        );
      }

      if (response.status === 204) return undefined as T;

      const text = await response.text();
      if (!text) return undefined as T;

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof CogneeCloudError && error.status < 500) throw error;

      const cause = error instanceof Error ? error : new Error(String(error));
      wasNetworkError = isCogneeNetworkError(cause);
    }
  }

  const detail = wasNetworkError
    ? "Cognee Cloud is unreachable. The tenant may be down or DNS is failing."
    : "Cognee Cloud request failed after 3 retries.";

  throw new CogneeCloudError(503, method, path, detail);
}

const NETWORK_ERROR_CODES = new Set([
  "ConnectionRefused",
  "ConnectionReset",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

function isCogneeNetworkError(error: Error | CogneeCloudError): boolean {
  if (error instanceof CogneeCloudError) return false;
  return NETWORK_ERROR_CODES.has((error as Error & { code?: string }).code ?? "");
}

async function readError(response: Response) {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return JSON.stringify(await response.json());
  }

  return response.text();
}

class CogneeCloudError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    message: string,
  ) {
    super(`Cognee Cloud request failed (${status}) ${method} ${path}: ${message}`);
  }
}

function formatDocumentForCognee(document: CogneeDocument) {
  return [
    `OpenDiagram source id: ${document.id}`,
    `Title: ${document.title}`,
    `Source type: ${document.sourceType}`,
    document.metadata ? `Metadata: ${JSON.stringify(document.metadata)}` : null,
    "Content:",
    document.content,
  ]
    .filter(Boolean)
    .join("\n");
}

function entryToText(entry: Record<string, unknown>) {
  for (const key of ["search_result", "text", "content", "context", "answer", "chunk"] as const) {
    const value = entry[key];
    if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, 1200);
    if (value && typeof value === "object") return JSON.stringify(value).slice(0, 1200);
  }

  return JSON.stringify(entry).slice(0, 1200);
}

function findBestDocument(documents: CogneeDocument[], text: string) {
  const lower = text.toLowerCase();

  return documents.find(
    (document) =>
      lower.includes(document.id.toLowerCase()) || lower.includes(document.title.toLowerCase()),
  );
}

function createSearchDocument(datasetName: string): CogneeDocument {
  return {
    id: `${datasetName}:search-result`,
    title: "Cognee Cloud search result",
    sourceType: "project",
    content: "Cognee Cloud returned this result without source metadata.",
    metadata: { datasetName },
  };
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "") || "document";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
