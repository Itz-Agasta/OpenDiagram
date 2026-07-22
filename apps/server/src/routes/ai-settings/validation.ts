/** Request schemas plus provider model discovery and capability validation. */
import type { UserAiProviderKind } from "@OpenDiagram/db/schema/user-ai-provider";
import { generateObject, generateText, tool } from "ai";
import { z } from "zod";
import { buildModelFromCredentials, defaultModelForProvider } from "../../lib/ai-provider";
import { listProviderModels } from "../../lib/ai-provider/list-models";
import { assertSafeBaseUrl } from "../../lib/ai-provider/safe-url";

export function modelIdFor(provider: UserAiProviderKind, modelId?: string) {
  return modelId ?? defaultModelForProvider(provider);
}

export function discoverModels(input: {
  provider: UserAiProviderKind;
  apiKey: string;
  baseUrl?: string | null;
}) {
  if (input.provider === "openai_compatible" && !input.baseUrl)
    throw new Error("Base URL is required for OpenAI-compatible providers.");
  return listProviderModels(input);
}

export async function validateCredentials(input: {
  provider: UserAiProviderKind;
  apiKey: string;
  modelId: string;
  baseUrl?: string | null;
}) {
  if (input.provider === "openai_compatible") {
    if (!input.baseUrl) throw new Error("Base URL is required for OpenAI-compatible providers.");
    assertSafeBaseUrl(input.baseUrl);
  }
  const { model } = buildModelFromCredentials(input);
  const options = validationOptionsFor(input.provider, input.modelId);
  const toolResult = await generateText({
    model,
    prompt: "Call the confirm tool with ok=true.",
    tools: {
      confirm: tool({
        description: "Confirm that tool calling works.",
        inputSchema: z.object({ ok: z.literal(true) }),
      }),
    },
    toolChoice: { type: "tool", toolName: "confirm" },
    ...options,
    maxRetries: 0,
  });
  if (!toolResult.toolCalls.some((call) => call.toolName === "confirm"))
    throw new Error("The selected model did not complete the required tool call.");
  await generateObject({
    model,
    prompt: "Return an object with ok set to true.",
    schema: z.object({ ok: z.literal(true) }),
    ...options,
    maxRetries: 0,
  });
}

export function validationOptionsFor(provider: UserAiProviderKind, modelId: string) {
  const needsBoundedReasoning =
    provider === "openrouter" && /^openai\/gpt-5(?:$|[-.:/])/i.test(modelId);
  return {
    maxOutputTokens: needsBoundedReasoning ? 128 : 64,
    providerOptions: needsBoundedReasoning
      ? { openrouter: { reasoning: { effort: "minimal" as const, exclude: true } } }
      : undefined,
  };
}
