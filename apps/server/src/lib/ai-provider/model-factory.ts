/** Builds provider SDK model configs */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { UserAiProviderKind } from "@OpenDiagram/db/schema/user-ai-provider";
import { env } from "@OpenDiagram/env/server";
import type { LanguageModel } from "ai";
import { AiProviderInvalidError } from "./provider-errors";
import { assertSafeBaseUrl } from "./safe-url";

const DEFAULT_GOOGLE_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4.1";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
const DEFAULT_COMPAT_MODEL = "gpt-4o-mini";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export async function buildModelFromCredentials(input: {
  provider: UserAiProviderKind;
  apiKey: string;
  modelId: string;
  baseUrl?: string | null;
}): Promise<{ model: LanguageModel; provider: string; modelId: string }> {
  const modelId = input.modelId.trim();
  if (!modelId) throw new AiProviderInvalidError("Model id is required.");

  if (input.provider === "google") {
    const google = createGoogle({ apiKey: input.apiKey });
    return { model: google(modelId), provider: "google", modelId };
  }
  if (input.provider === "openai") {
    const openai = createOpenAI({ apiKey: input.apiKey });
    return { model: openai(modelId), provider: "openai", modelId };
  }
  if (input.provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey: input.apiKey });
    return { model: anthropic(modelId), provider: "anthropic", modelId };
  }
  if (input.provider === "openrouter") {
    const openrouter = createOpenRouter({
      apiKey: input.apiKey,
      appName: "OpenDiagram",
      appUrl: env.CORS_ORIGIN.split(",")[0]?.trim() || "https://opendiagram.ink",
      compatibility: "strict",
    });
    return { model: openrouter.chat(modelId), provider: "openrouter", modelId };
  }

  const baseURL = input.baseUrl?.trim();
  if (!baseURL) {
    throw new AiProviderInvalidError("Base URL is required for OpenAI-compatible providers.");
  }
  await assertSafeBaseUrl(baseURL);
  const openai = createOpenAI({ apiKey: input.apiKey, baseURL });
  return {
    model: openai.chat(modelId),
    provider: "openai_compatible",
    modelId,
  };
}

export function defaultModelForProvider(provider: UserAiProviderKind): string {
  if (provider === "google") return DEFAULT_GOOGLE_MODEL;
  if (provider === "openai") return DEFAULT_OPENAI_MODEL;
  if (provider === "anthropic") return DEFAULT_ANTHROPIC_MODEL;
  if (provider === "openrouter") return DEFAULT_OPENROUTER_MODEL;
  return DEFAULT_COMPAT_MODEL;
}
