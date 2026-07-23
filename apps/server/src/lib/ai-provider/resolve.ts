/**
 * Picks the AI model for a request: a signed-in user's default BYOK provider if
 * they have one, otherwise the platform Gemini key. BYOK usage is the user's own
 * spend, so it doesn't count against the platform creation quota.
 */
import { createGoogle } from "@ai-sdk/google";
import { and, db, eq } from "@OpenDiagram/db";
import { userAiProvider } from "@OpenDiagram/db/schema/user-ai-provider";
import { env } from "@OpenDiagram/env/server";
import type { LanguageModel } from "ai";
import { decryptSecret } from "./encrypt";
import { getProvider } from "./registry";

const PLATFORM_MODEL = "gemini-2.5-flash";

export type ResolvedModel = {
  model: LanguageModel;
  source: "byok" | "platform";
  provider: string;
  modelId: string;
  /** True when this call should consume the platform creation quota. */
  countsAgainstQuota: boolean;
};

/** The signed-in user's default BYOK model, or null if they have none configured. */
async function resolveUserModel(userId: string): Promise<ResolvedModel | null> {
  const [row] = await db
    .select()
    .from(userAiProvider)
    .where(and(eq(userAiProvider.userId, userId), eq(userAiProvider.isDefault, true)))
    .limit(1);
  if (!row) return null;

  const provider = getProvider(row.provider);
  if (!provider) return null;

  const apiKey = decryptSecret(row.encryptedApiKey, {
    userId,
    providerId: row.id,
    provider: row.provider,
  });

  return {
    model: provider.createModel(apiKey, row.modelId),
    source: "byok",
    provider: row.provider,
    modelId: row.modelId,
    countsAgainstQuota: false,
  };
}

/** Platform fallback (server-funded Gemini). Null when no platform key is set. */
function resolvePlatformModel(): ResolvedModel | null {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
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
 * users, else platform. Returns null only when neither is available.
 */
export async function resolveModel(userId?: string | null): Promise<ResolvedModel | null> {
  if (userId) {
    const byok = await resolveUserModel(userId);
    if (byok) return byok;
  }
  return resolvePlatformModel();
}
