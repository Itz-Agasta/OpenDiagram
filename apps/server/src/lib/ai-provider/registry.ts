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
  /** iconify id for the settings UI, e.g. "simple-icons:openai". */
  icon: string;
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
    icon: "simple-icons:openai",
    docsUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
    models: [
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
    ],
    createModel: (apiKey, modelId) => createOpenAI({ apiKey })(modelId),
  },
  {
    id: "anthropic",
    label: "Anthropic",
    icon: "simple-icons:anthropic",
    docsUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-…",
    models: [
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
    createModel: (apiKey, modelId) => createAnthropic({ apiKey })(modelId),
  },
  {
    id: "google",
    label: "Google Gemini",
    icon: "simple-icons:googlegemini",
    docsUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
    ],
    createModel: (apiKey, modelId) => createGoogle({ apiKey })(modelId),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    icon: "simple-icons:openrouter",
    docsUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-…",
    models: [
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
      { id: "openai/gpt-4.1", label: "GPT-4.1" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1" },
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
