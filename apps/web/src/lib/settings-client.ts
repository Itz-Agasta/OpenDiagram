import { env } from "@OpenDiagram/env/web";

export type CatalogModel = { id: string; label: string };

/** Frontend-only: badge Gemini + DeepSeek models in pickers. */
export function isRecommendedModel(modelId: string, label?: string): boolean {
  const haystack = `${modelId} ${label ?? ""}`.toLowerCase();
  return haystack.includes("gemini") || haystack.includes("deepseek");
}

export type CatalogProvider = {
  id: string;
  label: string;
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

export type ProviderModelOption = {
  id: string;
  label: string;
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  isDefault: boolean;
};

const BASE = `${env.NEXT_PUBLIC_SERVER_URL}/api/settings/ai`;

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

/**
 * Cached because `AgentInputPanel` and `use-ai-chat-panel-controller` each fetch
 * this on mount, so one dashboard-then-workspace visit made four identical calls.
 *
 * Per-account: the payload carries `keyLast4`, so sign-out MUST clear it. Nothing
 * here reloads the page, and module state would otherwise outlive the account.
 */
let settingsCache: { settings: AiSettings; fetchedAt: number } | null = null;
let settingsRequest: Promise<AiSettings> | null = null;
const SETTINGS_TTL_MS = 30_000;

export function clearAiSettingsCache(): void {
  settingsCache = null;
  settingsRequest = null;
}

export async function getAiSettings(): Promise<AiSettings> {
  const cached = settingsCache;
  if (cached && Date.now() - cached.fetchedAt < SETTINGS_TTL_MS) return cached.settings;
  if (settingsRequest) return settingsRequest;

  const request = (async () => {
    const response = await fetch(`${BASE}/providers`, { credentials: "include" });
    if (!response.ok) throw new Error(await readError(response, "Failed to load Settings."));
    const settings = (await response.json()) as AiSettings;
    settingsCache = { settings, fetchedAt: Date.now() };
    return settings;
  })();
  settingsRequest = request;

  try {
    return await request;
  } finally {
    if (settingsRequest === request) settingsRequest = null;
  }
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
  clearAiSettingsCache();
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
  clearAiSettingsCache();
}

export function providerModelOptions(settings: AiSettings): ProviderModelOption[] {
  const catalog = new Map(settings.catalog.map((provider) => [provider.id, provider]));

  return settings.providers.flatMap((provider) => {
    const definition = catalog.get(provider.provider);
    if (!definition) return [];

    return definition.models.map((model) => ({
      id: `${provider.id}:${model.id}`,
      label: `${definition.label} · ${model.label}`,
      providerId: provider.id,
      providerLabel: definition.label,
      modelId: model.id,
      modelLabel: model.label,
      isDefault: provider.isDefault && provider.modelId === model.id,
    }));
  });
}

export async function selectProviderModel(option: ProviderModelOption): Promise<void> {
  await updateProvider(option.providerId, {
    modelId: option.modelId,
    makeDefault: true,
  });
}

export async function disconnectProvider(id: string): Promise<void> {
  const response = await fetch(`${BASE}/providers/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readError(response, "Could not disconnect provider."));
  clearAiSettingsCache();
}
