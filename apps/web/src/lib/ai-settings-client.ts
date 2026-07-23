import { env } from "@OpenDiagram/env/web";

export type CatalogModel = { id: string; label: string };

export type CatalogProvider = {
  id: string;
  label: string;
  icon: string;
  docsUrl: string;
  keyPlaceholder: string;
  models: CatalogModel[];
};

export type ConnectedProvider = {
  id: string;
  provider: string;
  modelId: string;
  keyLast4: string;
  isDefault: boolean;
  createdAt: string;
};

export type AiSettings = {
  encryptionReady: boolean;
  catalog: CatalogProvider[];
  providers: ConnectedProvider[];
};

const BASE = `${env.NEXT_PUBLIC_SERVER_URL}/api/settings/ai`;

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export async function getAiSettings(): Promise<AiSettings> {
  const response = await fetch(`${BASE}/providers`, { credentials: "include" });
  if (!response.ok) throw new Error(await readError(response, "Failed to load AI settings."));
  return response.json();
}

export async function connectProvider(input: {
  provider: string;
  apiKey: string;
  modelId: string;
}): Promise<void> {
  const response = await fetch(`${BASE}/providers`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response, "Could not connect provider."));
}

export async function updateProvider(
  id: string,
  input: { modelId?: string; makeDefault?: true },
): Promise<void> {
  const response = await fetch(`${BASE}/providers/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response, "Could not update provider."));
}

export async function disconnectProvider(id: string): Promise<void> {
  const response = await fetch(`${BASE}/providers/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readError(response, "Could not disconnect provider."));
}
