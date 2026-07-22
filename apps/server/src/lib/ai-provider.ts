/** Shared AI-provider facade for resolution, fallback execution, logging, and errors. */
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import type { RequestLogger } from "evlog";
import {
  AiProviderInvalidError,
  AiProviderRequiredError,
  pickGroqKey,
  type ResolvedModel,
} from "./ai-provider/resolve";

export {
  createPrimaryModel,
  resolveModel,
  AiProviderInvalidError,
  AiProviderRequiredError,
  type ResolvedModel,
  type AiModelSource,
  type AiCapability,
  buildModelFromCredentials,
  defaultModelForProvider,
  DEFAULT_PREFERRED_SOURCE,
  OPENROUTER_BASE_URL,
  PLATFORM_GROQ_MODELS,
  pickGroqKey,
} from "./ai-provider/resolve";

export { canEncryptByokKeys, encryptSecret, decryptSecret, keyLast4 } from "./ai-provider/encrypt";
export { assertSafeBaseUrl } from "./ai-provider/safe-url";

/** Intent classification model, matching the upstream orchestration path. */
const GROQ_ORCHESTRATOR_MODEL = "groq/compound-mini";

export class ProviderCapacityError extends Error {
  constructor(message = "Beta capacity is temporarily full.") {
    super(message);
    this.name = "ProviderCapacityError";
  }
}

/** Compact fields for wide-event logs when talking to a resolved model. */
export function aiProviderLogFields(
  resolved: ResolvedModel,
  extra?: Record<string, unknown>,
): { ai: Record<string, unknown> } {
  return {
    ai: {
      source: resolved.source,
      provider: resolved.provider,
      modelId: resolved.modelId,
      countsAgainstPlatformQuota: resolved.countsAgainstPlatformQuota,
      fallbackProvider: resolved.platformFallback?.provider ?? null,
      fallbackModelId: resolved.platformFallback?.modelId ?? null,
      ...extra,
    },
  };
}

export function createOrchestratorModel(): ReturnType<ReturnType<typeof createGroq>> {
  const key = pickGroqKey();
  if (!key) throw new Error("GROQ_API_KEY or GROQ_API_KEYS is required for orchestration.");
  const groq = createGroq({ apiKey: key });
  return groq(GROQ_ORCHESTRATOR_MODEL);
}

export function isProviderCapacityError(error: unknown) {
  return error instanceof ProviderCapacityError || isProviderRateLimitError(error);
}

/**
 * Run an LLM call on the resolved model; if a platform fallback exists (Gemini)
 * and the primary fails, retry once on the fallback. Non-streaming only.
 */
export async function runWithPlatformFallback<T>(
  resolved: ResolvedModel,
  run: (model: LanguageModel) => Promise<T>,
  options?: { log?: RequestLogger; purpose?: string },
): Promise<{ result: T; used: ResolvedModel }> {
  const purpose = options?.purpose ?? "llm";
  const log = options?.log;

  try {
    const result = await run(resolved.model);
    log?.set({
      ...aiProviderLogFields(resolved, { purpose, phase: "success", usedFallback: false }),
    });
    return { result, used: resolved };
  } catch (primaryError) {
    if (!resolved.platformFallback) {
      log?.error("AI provider call failed (no fallback)", {
        error: primaryError,
        ...aiProviderLogFields(resolved, { purpose, phase: "error" }),
      });
      throw primaryError;
    }

    log?.warn("AI primary provider failed; trying platform fallback", {
      error: primaryError,
      ...aiProviderLogFields(resolved, {
        purpose,
        phase: "fallback",
        primaryProvider: resolved.provider,
        primaryModelId: resolved.modelId,
      }),
    });

    try {
      const result = await run(resolved.platformFallback.model);
      log?.set({
        ...aiProviderLogFields(resolved.platformFallback, {
          purpose,
          phase: "success",
          usedFallback: true,
          primaryProvider: resolved.provider,
          primaryModelId: resolved.modelId,
        }),
      });
      return { result, used: resolved.platformFallback };
    } catch (fallbackError) {
      log?.error("AI primary and fallback providers failed", {
        error: fallbackError,
        primaryError,
        ...aiProviderLogFields(resolved, {
          purpose,
          phase: "error",
          usedFallback: true,
          fallbackProvider: resolved.platformFallback.provider,
          fallbackModelId: resolved.platformFallback.modelId,
        }),
      });
      // Surface the original failure — usually the more informative one (e.g. rate limit).
      throw primaryError;
    }
  }
}

export function providerCapacityResponse() {
  return {
    error:
      "Our diagram painters are chilling for a minute. Beta capacity got cooked. Try again shortly.",
    code: "provider_capacity_exhausted",
  };
}

export function providerCapacityMessage() {
  return providerCapacityResponse().error;
}

export function isProviderCreditError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
  return /insufficient credits?|credit limit|credits? exhausted|billing|payment required|exceeds? your (current )?quota/.test(
    message,
  );
}

export function providerCreditResponse() {
  return {
    error:
      "Your selected BYOK provider has reached its credit limit. Update that provider's billing or choose another model in Settings.",
    code: "byok_credit_exhausted",
  };
}

export function aiProviderErrorResponse(error: unknown) {
  if (error instanceof AiProviderRequiredError) {
    return {
      status: 400 as const,
      body: { error: error.message, code: error.code },
    };
  }
  if (error instanceof AiProviderInvalidError) {
    return {
      status: 400 as const,
      body: { error: error.message, code: error.code },
    };
  }
  return null;
}

export function applyAiProviderHeaders(
  c: { header: (k: string, v: string) => void },
  resolved: ResolvedModel,
) {
  c.header("X-AI-Provider-Source", resolved.source);
  c.header("X-AI-Provider-Model", resolved.modelId);
  c.header("X-AI-Provider-Name", resolved.provider);
  if (resolved.platformFallback) {
    c.header("X-AI-Provider-Fallback", resolved.platformFallback.modelId);
  }
}

function isProviderRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.statusCode === 429 || record.status === 429) return true;
  const response = record.response as { status?: unknown } | undefined;
  if (response?.status === 429) return true;
  const cause = record.cause;
  if (cause && typeof cause === "object") return isProviderRateLimitError(cause);
  const message = String(record.message ?? "").toLowerCase();
  return (
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("resource exhausted")
  );
}
