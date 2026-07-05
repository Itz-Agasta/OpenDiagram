import { env } from "@OpenDiagram/env/server";

type CogneeDataset = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string | null;
  ownerId?: string;
};

type CogneeRememberResponse = {
  status?: string;
  dataset_name?: string;
  dataset_id?: string;
  pipeline_run_id?: string;
  items_processed?: number;
  elapsed_seconds?: number;
  items?: Array<{ id?: string }>;
};

export type CogneeSearchResult = {
  search_result: unknown;
  dataset_id?: string | null;
  dataset_name?: string | null;
};

type CogneeSearchInput = {
  datasetIds?: string[];
  datasets?: string[];
  query: string;
  searchType?: string;
  systemPrompt?: string;
  topK?: number;
  onlyContext?: boolean;
  includeReferences?: boolean;
};

type CogneeRememberInput = {
  datasetId?: string;
  datasetName?: string;
  documents: Array<{ name: string; content: string }>;
  nodeSet?: string;
  customPrompt?: string;
  runInBackground?: boolean;
};

export function isCogneeConfigured() {
  return Boolean(env.COGNEE_BASE_URL && env.COGNEE_API_KEY);
}

export async function checkCogneeHealth() {
  if (!isCogneeConfigured()) return { ok: false, disabled: true };

  try {
    await cogneeRequest("/health", { method: "GET" });
    return { ok: true, disabled: false };
  } catch {
    await cogneeRequest("/api/v1/health", { method: "GET" });
    return { ok: true, disabled: false };
  }
}

export async function createCogneeDataset(name: string) {
  return cogneeRequest<CogneeDataset>("/api/v1/datasets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function rememberCogneeDocuments(input: CogneeRememberInput) {
  const form = new FormData();
  if (input.datasetId) form.append("datasetId", input.datasetId);
  if (input.datasetName) form.append("datasetName", input.datasetName);
  if (input.nodeSet) form.append("node_set", input.nodeSet);
  if (input.customPrompt) form.append("custom_prompt", input.customPrompt);
  form.append("run_in_background", String(input.runInBackground ?? false));

  for (const document of input.documents) {
    form.append("data", new File([document.content], document.name, { type: "text/markdown" }));
  }

  return cogneeRequest<CogneeRememberResponse>("/api/v1/remember", {
    method: "POST",
    body: form,
  });
}

export async function searchCognee(input: CogneeSearchInput) {
  return cogneeRequest<CogneeSearchResult[]>("/api/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      datasetIds: input.datasetIds,
      datasets: input.datasets,
      query: input.query,
      searchType: input.searchType ?? "GRAPH_COMPLETION",
      systemPrompt: input.systemPrompt,
      topK: input.topK ?? 8,
      onlyContext: input.onlyContext ?? true,
      includeReferences: input.includeReferences ?? true,
    }),
  });
}

export async function getCogneeDatasetStatus(datasetIds: string[]) {
  const search = new URLSearchParams();
  for (const datasetId of datasetIds) search.append("dataset_ids", datasetId);
  return cogneeRequest(`/api/v1/datasets/status?${search.toString()}`, { method: "GET" });
}

export async function deleteCogneeDataset(datasetId: string) {
  return cogneeRequest(`/api/v1/datasets/${encodeURIComponent(datasetId)}`, { method: "DELETE" });
}

async function cogneeRequest<T = unknown>(path: string, init: RequestInit): Promise<T> {
  const config = getCogneeConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      ...init.headers,
      "X-Api-Key": config.apiKey,
    },
  });

  const contentType = response.headers.get("content-type");
  const body = contentType?.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    throw new CogneeApiError(response.status, init.method ?? "GET", path, body);
  }

  return body as T;
}

function getCogneeConfig() {
  if (!env.COGNEE_BASE_URL || !env.COGNEE_API_KEY) {
    throw new CogneeApiError(0, "CONFIG", "", {
      error: "Cognee is not configured.",
      detail: "Set COGNEE_BASE_URL and COGNEE_API_KEY on the server.",
    });
  }

  return {
    baseUrl: env.COGNEE_BASE_URL.replace(/\/$/, ""),
    apiKey: env.COGNEE_API_KEY,
  };
}

export class CogneeApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly responseBody: unknown,
  ) {
    super(`Cognee request failed (${status}) ${method} ${path}: ${getErrorMessage(responseBody)}`);
  }
}

function getErrorMessage(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const body = value as { error?: unknown; detail?: unknown };
    return [body.error, body.detail].filter(Boolean).join(" - ") || "Unknown Cognee error";
  }
  return "Unknown Cognee error";
}
