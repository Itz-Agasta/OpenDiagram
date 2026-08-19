import { queryOptions } from "@tanstack/react-query";
import { getDevFetch } from "../dev-telemetry";
import type { AiSettings, ProviderModelOption } from "../types";

/** Frontend-only: badge Gemini + DeepSeek models in pickers. */
export function isRecommendedModel(modelId: string, label?: string): boolean {
  const haystack = `${modelId} ${label ?? ""}`.toLowerCase();
  return haystack.includes("gemini") || haystack.includes("deepseek");
}

const BASE_URL = import.meta.env.VITE_SERVER_URL || "";
const BASE = `${BASE_URL.replace(/\/$/, "")}/api/settings/ai`;
const devFetch = getDevFetch();

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

/**
 * Cached settings using a module variable with TTL.
 * Sign-out or modification clears it.
 */
let settingsCache: { settings: AiSettings; fetchedAt: number } | null = null;
let settingsRequest: Promise<AiSettings> | null = null;
let generation = 0;
const SETTINGS_TTL_MS = 30_000;

export function clearAiSettingsCache(): void {
  generation += 1;
  settingsCache = null;
  settingsRequest = null;
}

export async function getAiSettings(): Promise<AiSettings> {
  const cached = settingsCache;
  if (cached && Date.now() - cached.fetchedAt < SETTINGS_TTL_MS) return cached.settings;
  if (settingsRequest) return settingsRequest;

  const started = generation;
  const request = (async () => {
    const response = await devFetch(`${BASE}/providers`, { credentials: "include" });
    if (!response.ok) throw new Error(await readError(response, "Failed to load Settings."));
    const settings = (await response.json()) as AiSettings;
    if (started === generation) settingsCache = { settings, fetchedAt: Date.now() };
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
  const response = await devFetch(`${BASE}/providers`, {
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
  input: { modelId?: string; makeDefault?: boolean },
): Promise<void> {
  const response = await devFetch(`${BASE}/providers/${id}`, {
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

export async function disconnectProvider(id: string): Promise<void> {
  const response = await devFetch(`${BASE}/providers/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readError(response, "Could not disconnect provider."));
  clearAiSettingsCache();
}

export const aiSettingsQueryOptions = (userId: string | undefined, enabled: boolean) =>
  queryOptions({
    queryKey: ["settings", "ai", userId ?? ""],
    queryFn: getAiSettings,
    enabled: enabled && !!userId,
  });
