/**
 * Data-driven catalog of BYOK providers. Adding a provider = adding one entry:
 * a bit of UI metadata, a curated model list, and a factory that turns a key +
 * model id into a runnable AI SDK model. No switch statements anywhere else.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { UserAiProviderKind } from "@OpenDiagram/db/schema/user-ai-provider";
import type { LanguageModel } from "ai";

export type ProviderModel = { id: string; label: string };

export type ProviderDefinition = {
  id: UserAiProviderKind;
  label: string;
  /** Where users get a key. */
  docsUrl: string;
  keyPlaceholder: string;
  /** Curated, diagram-friendly models. First is the default. */
  models: ProviderModel[];
  /** Build a runnable model from a user key + chosen model id. */
  createModel: (apiKey: string, modelId: string) => LanguageModel;
};

const providers: ProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    docsUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
    // API IDs: https://developers.openai.com/api/docs/models/all
    models: [
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { id: "gpt-5.5", label: "GPT-5.5" },
    ],
    createModel: (apiKey, modelId) => createOpenAI({ apiKey })(modelId),
  },
  {
    id: "anthropic",
    label: "Anthropic",
    docsUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-…",
    // API IDs: https://platform.claude.com/docs/en/about-claude/models/overview
    // (dateless form: claude-{name}-{major}[-{minor}])
    models: [
      { id: "claude-fable-5", label: "Claude Fable 5" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    ],
    createModel: (apiKey, modelId) => createAnthropic({ apiKey })(modelId),
  },
  {
    id: "google",
    label: "Google Gemini",
    docsUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
    // API IDs: https://ai.google.dev/gemini-api/docs/models
    models: [
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
    createModel: (apiKey, modelId) => createGoogle({ apiKey })(modelId),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    docsUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-…",
    // Same catalog via OpenRouter provider-prefixed IDs
    // DeepSeek: https://openrouter.ai/deepseek
    models: [
      { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { id: "openai/gpt-5.5", label: "GPT-5.5" },
      { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4" },
      { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1" },
      { id: "anthropic/claude-fable-5", label: "Claude Fable 5" },
      { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
    ],
    createModel: (apiKey, modelId) => createOpenRouter({ apiKey }).chat(modelId),
  },
];

const byId = new Map(providers.map((p) => [p.id, p]));

export function listProviders(): ProviderDefinition[] {
  return providers;
}

export function getProvider(id: string): ProviderDefinition | undefined {
  return byId.get(id as UserAiProviderKind);
}

/** True when `modelId` is one this provider actually offers. */
export function isKnownModel(provider: ProviderDefinition, modelId: string): boolean {
  return provider.models.some((m) => m.id === modelId);
}
