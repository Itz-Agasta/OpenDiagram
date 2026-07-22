/**
 * Resolves the effective AI model from user preference, BYOK credentials,
 * user configuration and capability-specific hosted platform fallbacks.
 */
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { and, asc, db, desc, eq } from "@OpenDiagram/db";
import {
  userAiPreference,
  userAiProvider,
  type PreferredAiSource,
} from "@OpenDiagram/db/schema/user-ai-provider";
import { env } from "@OpenDiagram/env/server";
import type { LanguageModel } from "ai";
import { decryptSecret } from "./encrypt";
import { buildModelFromCredentials } from "./model-factory";
import { DEFAULT_PREFERRED_SOURCE, sourceOrderForPreference } from "./preferences";
import { AiProviderInvalidError, AiProviderRequiredError } from "./provider-errors";

export { DEFAULT_PREFERRED_SOURCE, sourceOrderForPreference } from "./preferences";
export {
  buildModelFromCredentials,
  defaultModelForProvider,
  OPENROUTER_BASE_URL,
} from "./model-factory";
export { AiProviderInvalidError, AiProviderRequiredError } from "./provider-errors";

/** What the call site needs from the model. */
export type AiCapability = "tools" | "structured" | "text";

/** Platform Groq models by capability (free-tier friendly). */
export const PLATFORM_GROQ_MODELS: Record<AiCapability, string> = {
  // Local tool calling for diagram agent (ask_user, draw_diagram).
  tools: "llama-3.3-70b-versatile",
  // Structured outputs (strict json_schema) for generateObject DiagramSpec.
  structured: "openai/gpt-oss-20b",
  // Cheap free-text: project Q&A, docs, orchestrator.
  text: "llama-3.1-8b-instant",
};

const GEMINI_MODEL = "gemini-2.5-flash";
export type AiModelSource = "byok" | "platform";

export type ResolvedModel = {
  model: LanguageModel;
  source: AiModelSource;
  provider: string;
  modelId: string;
  /** When true, platform creation quota should be consumed. */
  countsAgainstPlatformQuota: boolean;
  /**
   * Alternate platform model when primary fails (typically Groq after Gemini).
   * Call sites that can retry (non-streaming) should use `runWithPlatformFallback`.
   */
  platformFallback?: ResolvedModel;
};

export function pickGroqKey(): string | null {
  const keys = [env.GROQ_API_KEYS, env.GROQ_API_KEY]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)] ?? null;
}

export async function resolveModel(input: {
  userId?: string | null;
  providerId?: string;
  modelId?: string;
  /** Defaults to free-text when omitted. */
  capability?: AiCapability;
}): Promise<ResolvedModel> {
  const capability = input.capability ?? "text";
  if (input.providerId && input.userId) {
    const byok = await tryUserByok(input.userId, input.providerId, input.modelId);
    if (!byok) throw new AiProviderInvalidError("Selected AI provider was not found.");
    return byok;
  }
  const preferred = input.userId ? await loadPreferredSource(input.userId) : "platform";
  const attempts = sourceOrderForPreference(preferred);

  const errors: string[] = [];

  for (const source of attempts) {
    try {
      if (source === "byok" && input.userId) {
        const byok = await tryUserByok(input.userId);
        if (byok) return byok;
      }

      if (source === "platform") {
        const platform = tryPlatform(capability);
        if (platform) return platform;
        throw new AiProviderRequiredError(
          env.AI_PLATFORM_ENABLED
            ? "Platform AI is not configured on this server."
            : "Platform AI is disabled. Add an API key in Settings.",
        );
      }
    } catch (error) {
      if (error instanceof AiProviderRequiredError || error instanceof AiProviderInvalidError) {
        if (preferred !== "auto") throw error;
        errors.push(error.message);
        continue;
      }
      throw error;
    }
  }

  throw new AiProviderRequiredError(errors[0] ?? "Configure an AI provider in Settings.");
}

/** Platform model only — used by smoke tests and internal fallbacks. */
export function createPrimaryModel(capability: AiCapability = "text"): LanguageModel {
  const resolved = tryPlatform(capability);
  if (!resolved) {
    throw new Error("No platform AI configured. Set GROQ_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.");
  }
  return resolved.model;
}

async function loadPreferredSource(userId: string): Promise<PreferredAiSource> {
  const [row] = await db
    .select({ preferredSource: userAiPreference.preferredSource })
    .from(userAiPreference)
    .where(eq(userAiPreference.userId, userId))
    .limit(1);
  return row?.preferredSource ?? DEFAULT_PREFERRED_SOURCE;
}

async function tryUserByok(
  userId: string,
  providerId?: string,
  modelId?: string,
): Promise<ResolvedModel | null> {
  const [selectedRow] = providerId
    ? await db
        .select()
        .from(userAiProvider)
        .where(and(eq(userAiProvider.userId, userId), eq(userAiProvider.id, providerId)))
        .limit(1)
    : [];
  const [defaultRow] = selectedRow
    ? [selectedRow]
    : await db
        .select()
        .from(userAiProvider)
        .where(and(eq(userAiProvider.userId, userId), eq(userAiProvider.isDefault, true)))
        .orderBy(asc(userAiProvider.createdAt), asc(userAiProvider.id))
        .limit(1);

  if (providerId && !selectedRow) return null;

  const [fallbackRow] = defaultRow
    ? [defaultRow]
    : await db
        .select()
        .from(userAiProvider)
        .where(eq(userAiProvider.userId, userId))
        .orderBy(
          desc(userAiProvider.isDefault),
          asc(userAiProvider.createdAt),
          asc(userAiProvider.id),
        )
        .limit(1);

  const providerRow = selectedRow ?? defaultRow ?? fallbackRow;
  if (!providerRow) return null;

  let apiKey: string;
  try {
    apiKey = decryptSecret(providerRow.encryptedApiKey, {
      userId,
      providerId: providerRow.id,
      provider: providerRow.provider,
    });
  } catch {
    throw new AiProviderInvalidError(
      "Could not decrypt stored API key. Check BYOK_ENCRYPTION_KEY on the server.",
    );
  }

  const built = await buildModelFromCredentials({
    provider: providerRow.provider,
    apiKey,
    modelId: modelId ?? providerRow.modelId,
    baseUrl: providerRow.baseUrl,
  });

  return {
    model: built.model,
    source: "byok",
    provider: built.provider,
    modelId: built.modelId,
    countsAgainstPlatformQuota: false,
  };
}

function tryPlatform(capability: AiCapability): ResolvedModel | null {
  if (!env.AI_PLATFORM_ENABLED) return null;
  const gemini = tryGeminiPlatform();
  const groq = tryGroqPlatform(capability);
  // Streaming tool responses cannot safely switch providers after partial
  // output. Non-streaming text/structured workflows retry through the facade.
  if (capability === "tools") return gemini ?? groq;
  if (gemini && groq) return { ...gemini, platformFallback: groq };
  return gemini ?? groq;
}

function tryGroqPlatform(capability: AiCapability): ResolvedModel | null {
  const apiKey = pickGroqKey();
  if (!apiKey) return null;
  const modelId = PLATFORM_GROQ_MODELS[capability];
  const groq = createGroq({ apiKey });
  return {
    model: groq(modelId),
    source: "platform",
    provider: "groq",
    modelId,
    countsAgainstPlatformQuota: true,
  };
}

function tryGeminiPlatform(): ResolvedModel | null {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) return null;

  const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  return {
    model: google(GEMINI_MODEL),
    source: "platform",
    provider: "google",
    modelId: GEMINI_MODEL,
    countsAgainstPlatformQuota: true,
  };
}
