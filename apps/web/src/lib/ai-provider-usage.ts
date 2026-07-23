export type AiProviderSource = "byok" | "platform";

export type AiProviderUsage = {
  source: AiProviderSource;
  provider: string;
  modelId: string;
};

const SOURCE_LABELS: Record<AiProviderSource, string> = {
  byok: "BYOK",
  platform: "Platform",
};

function isAiProviderSource(value: string): value is AiProviderSource {
  return value === "byok" || value === "platform";
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    anthropic: "Anthropic",
    google: "Google",
    openai: "OpenAI",
    openai_compatible: "OpenAI-compatible",
    openrouter: "OpenRouter",
  };
  return labels[provider] ?? provider;
}

export function readAiProviderUsage(response: Response): AiProviderUsage | null {
  const source = response.headers.get("X-AI-Provider-Source");
  const provider = response.headers.get("X-AI-Provider-Name");
  const modelId = response.headers.get("X-AI-Provider-Model");

  if (!source || !isAiProviderSource(source) || !provider || !modelId) return null;
  return { source, provider, modelId };
}

export function formatAiProviderUsage(usage: AiProviderUsage): string {
  const details = [SOURCE_LABELS[usage.source]];
  details.push(providerLabel(usage.provider));
  details.push(usage.modelId);
  return details.join(" · ");
}
