/**
 * Picks the AI model for a request: the one the caller asked for, else the
 * signed-in user's default BYOK provider, else the platform Gemini key. BYOK
 * usage is the user's own spend, so it doesn't count against the platform
 * creation quota.
 */
import { createGoogle } from "@ai-sdk/google";
import { and, db, eq } from "@OpenDiagram/db";
import { userAiProvider } from "@OpenDiagram/db/schema/ai";
import { env } from "@OpenDiagram/env/server";
import type { LanguageModel } from "ai";
import { createCachingFetch } from "../agent/cache";
import { decryptSecret } from "./encrypt";
import { getProvider, isKnownModel } from "./registry";

const PLATFORM_MODEL = "gemini-2.5-flash";

export type ResolvedModel = {
  model: LanguageModel;
  source: "byok" | "platform";
  provider: string;
  modelId: string;
  /** True when this call should consume the platform creation quota. */
  countsAgainstQuota: boolean;
};

/**
 * One request's override of the user's saved default. `providerId` is the
 * `user_ai_provider` ROW id, NOT the provider kind ("openai").
 */
export type ModelSelection = { providerId?: string | null; modelId?: string | null };

/**
 * A selection the caller cannot run, which routes turn into a 400. Degrading to
 * the platform model instead would answer on a model the user did not pick and
 * bill it to their creation quota.
 */
export class ModelSelectionError extends Error {}

/** The user's BYOK model for this request, or null if they have no usable key. */
async function resolveUserModel(
  userId: string,
  { providerId, modelId }: ModelSelection,
): Promise<ResolvedModel | null> {
  const [row] = await db
    .select()
    .from(userAiProvider)
    .where(
      and(
        eq(userAiProvider.userId, userId),
        // Never drop the userId predicate and match on the row id alone, even
        // though it is the primary key: that is what stops one user naming
        // another user's row and running on their key.
        providerId ? eq(userAiProvider.id, providerId) : eq(userAiProvider.isDefault, true),
      ),
    )
    .limit(1);
  if (!row) {
    if (providerId) throw new ModelSelectionError("That provider is not connected.");
    return null;
  }

  const provider = getProvider(row.provider);
  if (!provider) {
    if (providerId) throw new ModelSelectionError("That provider is no longer supported.");
    return null;
  }

  if (modelId && !isKnownModel(provider, modelId)) {
    throw new ModelSelectionError(`${provider.label} does not offer that model.`);
  }
  const chosenModelId = modelId ?? row.modelId;

  // If the key can't be decrypted (e.g. BYOK_ENCRYPTION_KEY unset/rotated) the
  // caller who named no provider falls back to the platform model rather than
  // failing the whole request. One who named this row does not: they would be
  // billed quota for a model they did not pick.
  let apiKey: string;
  try {
    apiKey = decryptSecret(row.encryptedApiKey, { userId, provider: row.provider });
  } catch {
    if (providerId) {
      throw new ModelSelectionError(
        `Your saved ${provider.label} key could not be used. Reconnect it in Settings.`,
      );
    }
    return null;
  }

  return {
    model: provider.createModel(apiKey, chosenModelId),
    source: "byok",
    provider: row.provider,
    modelId: chosenModelId,
    countsAgainstQuota: false,
  };
}

/**
 * Platform fallback (server-funded Gemini). Null when no platform key is set.
 *
 * The context cache is wired in HERE and nowhere else: a Gemini cache can only be
 * read by the key that created it, so a BYOK provider would pay hourly storage
 * for a cache that only its own user's requests could hit.
 */
function resolvePlatformModel(): ResolvedModel | null {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  const google = createGoogle({
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    fetch: createCachingFetch(env.GOOGLE_GENERATIVE_AI_API_KEY, PLATFORM_MODEL),
  });
  return {
    model: google(PLATFORM_MODEL),
    source: "platform",
    provider: "google",
    modelId: PLATFORM_MODEL,
    countsAgainstQuota: true,
  };
}

/**
 * Resolve the model for a (maybe-anonymous) request: BYOK first for signed-in
 * users, else platform. Returns null only when neither is available, and throws
 * `ModelSelectionError` when `selection` names something the user cannot run.
 *
 * An anonymous caller's `selection` is ignored rather than rejected: the options
 * are built from the caller's own connected providers, so they never had one.
 */
export async function resolveModel(
  userId?: string | null,
  selection: ModelSelection = {},
): Promise<ResolvedModel | null> {
  if (userId) {
    const byok = await resolveUserModel(userId, selection);
    if (byok) return byok;
  }
  return resolvePlatformModel();
}
