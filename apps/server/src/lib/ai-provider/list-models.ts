/** Lists models visible to supplied BYOK credentials without persisting the secret. */
import type { UserAiProviderKind } from "@OpenDiagram/db/schema/user-ai-provider";
import { env } from "@OpenDiagram/env/server";
import { OPENROUTER_BASE_URL } from "./model-factory";
import { assertSafeBaseUrl } from "./safe-url";

export type ListedModel = {
  id: string;
  label: string;
};

const OPENAI_EXCLUDE =
  /embedding|whisper|tts|dall-e|davinci|babbage|ada|curie|moderation|realtime|transcribe|search|audio|image|sora|codex-mini/i;

/**
 * Fetch models available for the given provider credentials.
 * Used by the settings UI so users pick a model instead of typing ids.
 */
export async function listProviderModels(input: {
  provider: UserAiProviderKind;
  apiKey: string;
  baseUrl?: string | null;
}): Promise<ListedModel[]> {
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 8) throw new Error("API key is required to list models.");

  if (input.provider === "google") {
    return listGoogleModels(apiKey);
  }

  if (input.provider === "anthropic") {
    return listAnthropicModels(apiKey);
  }

  if (input.provider === "openai") {
    return listOpenAiCompatibleModels(apiKey, "https://api.openai.com/v1", filterOpenAiChatModels);
  }

  if (input.provider === "openrouter") {
    return listOpenAiCompatibleModels(apiKey, OPENROUTER_BASE_URL, filterOpenRouterModels, {
      "HTTP-Referer": env.CORS_ORIGIN.split(",")[0]?.trim() || "https://opendiagram.ink",
      "X-Title": "OpenDiagram",
    });
  }

  // openai_compatible
  const base = input.baseUrl?.trim();
  if (!base) throw new Error("Base URL is required for OpenAI-compatible providers.");
  assertSafeBaseUrl(base);
  return listOpenAiCompatibleModels(apiKey, base, (ids) =>
    ids
      .map((id) => id.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((id) => ({ id, label: id })),
  );
}

async function listGoogleModels(apiKey: string): Promise<ListedModel[]> {
  const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
  url.searchParams.set("pageSize", "100");

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(parseProviderError(response.status, body, "Google Gemini"));
  }

  const data = (await response.json()) as {
    models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
  };

  const models = (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => {
      const raw = m.name ?? "";
      const id = raw.replace(/^models\//, "");
      return {
        id,
        label: m.displayName ? `${m.displayName} (${id})` : id,
      };
    })
    .filter((m) => m.id.length > 0)
    .filter((m) => !/embedding/i.test(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (models.length === 0) {
    throw new Error("No Gemini generateContent models found for this key.");
  }
  return models;
}

async function listAnthropicModels(apiKey: string): Promise<ListedModel[]> {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(parseProviderError(response.status, body, "Anthropic"));
  }

  const data = (await response.json()) as {
    data?: Array<{ id?: string; display_name?: string }>;
  };

  const models = (data.data ?? [])
    .map((m) => {
      const id = m.id?.trim() ?? "";
      return {
        id,
        label: m.display_name ? `${m.display_name} (${id})` : id,
      };
    })
    .filter((m) => m.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (models.length === 0) {
    throw new Error("No Anthropic models found for this key.");
  }
  return models;
}

async function listOpenAiCompatibleModels(
  apiKey: string,
  baseUrl: string,
  filter: (ids: string[]) => ListedModel[],
  extraHeaders?: Record<string, string>,
): Promise<ListedModel[]> {
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/models`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(parseProviderError(response.status, body, "provider"));
  }

  const data = (await response.json()) as {
    data?: Array<{ id?: string; name?: string }>;
    models?: Array<{ id?: string }>;
  };

  const ids = [
    ...(data.data ?? []).map((m) => m.id ?? m.name).filter((id): id is string => Boolean(id)),
    ...(data.models ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)),
  ];

  const models = filter(ids);
  if (models.length === 0) {
    throw new Error("No usable chat models found for this key.");
  }
  return models;
}

function filterOpenAiChatModels(ids: string[]): ListedModel[] {
  return ids
    .filter((id) => !OPENAI_EXCLUDE.test(id))
    .filter((id) => /^(gpt|o[1-9]|chatgpt|ft:)/i.test(id) || id.includes("gpt"))
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, label: id }));
}

function filterOpenRouterModels(ids: string[]): ListedModel[] {
  // OpenRouter catalog is large; keep chat-ish text models, de-dupe, sort free first.
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const free: string[] = [];
  const paid: string[] = [];
  for (const id of unique) {
    if (/embedding|whisper|tts|moderation|image|video|audio/i.test(id)) continue;
    if (id.endsWith(":free") || id.includes("/free")) free.push(id);
    else paid.push(id);
  }
  free.sort((a, b) => a.localeCompare(b));
  paid.sort((a, b) => a.localeCompare(b));
  return [...free, ...paid].map((id) => ({
    id,
    label: id.endsWith(":free") || id.includes("/free") ? `${id} (free)` : id,
  }));
}

function parseProviderError(status: number, body: string, provider: string): string {
  if (status === 401 || status === 403) {
    return `Invalid or unauthorized ${provider} API key.`;
  }
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const msg = typeof json.error === "string" ? json.error : json.error?.message || json.message;
    if (msg) return msg;
  } catch {
    // ignore
  }
  if (body.trim()) return body.slice(0, 200);
  return `Could not list models (${status}).`;
}
