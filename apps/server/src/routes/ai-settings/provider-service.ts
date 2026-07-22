/** Persistence, encryption, validation orchestration, and default-provider invariants. */
import { and, asc, db, eq, sql } from "@OpenDiagram/db";
import {
  userAiPreference,
  userAiProvider,
  type PreferredAiSource,
} from "@OpenDiagram/db/schema/user-ai-provider";
import {
  canEncryptByokKeys,
  DEFAULT_PREFERRED_SOURCE,
  encryptSecret,
  keyLast4,
} from "../../lib/ai-provider";
import { ByokEncryptionError, decryptSecret } from "../../lib/ai-provider/encrypt";
import { listProviderModels, type ListedModel } from "../../lib/ai-provider/list-models";
import { assertSafeBaseUrl } from "../../lib/ai-provider/safe-url";
import type { CreateProviderInput, UpdateProviderInput } from "./schemas";
import { modelIdFor, validateCredentials } from "./validation";

const MODEL_CACHE_TTL_MS = 10 * 60_000;
const MODEL_CACHE_CLEANUP_INTERVAL_MS = 60_000;
const MODEL_CACHE_MAX_ENTRIES = 10_000;
const modelCache = new Map<string, { expiresAt: number; models: ListedModel[] }>();
let nextModelCacheCleanupAt = 0;

export class ProviderConfigurationError extends Error {
  code = "ai_provider_invalid" as const;

  constructor(error: unknown) {
    super(error instanceof Error ? error.message : "Provider configuration is invalid.");
    this.name = "ProviderConfigurationError";
  }
}

export function publicProvider(row: typeof userAiProvider.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    baseUrl: row.baseUrl,
    modelId: row.modelId,
    keyLast4: row.keyLast4,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getProviderSettings(userId: string) {
  const [providers, [preference]] = await Promise.all([
    db.select().from(userAiProvider).where(eq(userAiProvider.userId, userId)),
    db.select().from(userAiPreference).where(eq(userAiPreference.userId, userId)).limit(1),
  ]);
  providers.sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return {
    preferredSource: (preference?.preferredSource ?? DEFAULT_PREFERRED_SOURCE) as PreferredAiSource,
    providers: providers.map(publicProvider),
  };
}

export async function getSavedProviderModels(userId: string, id: string) {
  const [provider] = await db
    .select()
    .from(userAiProvider)
    .where(and(eq(userAiProvider.id, id), eq(userAiProvider.userId, userId)))
    .limit(1);
  if (!provider) return null;

  const cached = modelCache.get(id);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.models;
  if (cached) modelCache.delete(id);

  const apiKey = decryptSecret(provider.encryptedApiKey, {
    userId,
    providerId: provider.id,
    provider: provider.provider,
  });
  const models = await listProviderModels({
    provider: provider.provider,
    apiKey,
    baseUrl: provider.baseUrl,
  });
  const expiresAt = Date.now() + MODEL_CACHE_TTL_MS;
  if (modelCache.size >= MODEL_CACHE_MAX_ENTRIES && Date.now() >= nextModelCacheCleanupAt) {
    for (const [cacheKey, value] of modelCache) {
      if (value.expiresAt <= Date.now()) modelCache.delete(cacheKey);
    }
    nextModelCacheCleanupAt = Date.now() + MODEL_CACHE_CLEANUP_INTERVAL_MS;
  }
  while (modelCache.size >= MODEL_CACHE_MAX_ENTRIES) {
    const oldestKey = modelCache.keys().next().value;
    if (!oldestKey) break;
    modelCache.delete(oldestKey);
  }
  modelCache.set(id, { expiresAt, models });
  return models;
}

export async function createProvider(userId: string, data: CreateProviderInput) {
  requireEncryptionReady();
  await assertProviderBaseUrl(data.provider, data.baseUrl);
  const modelId = modelIdFor(data.provider, data.modelId);

  try {
    await validateCredentials({ ...data, modelId });
  } catch (error) {
    throw new ProviderConfigurationError(error);
  }

  const id = crypto.randomUUID();
  const encryptedApiKey = encryptSecret(data.apiKey, {
    userId,
    providerId: id,
    provider: data.provider,
  });

  const [row] = await db.transaction(async (transaction) => {
    await transaction.execute(sql`select id from "user" where id = ${userId} for update`);
    const existing = await transaction
      .select({ isDefault: userAiProvider.isDefault })
      .from(userAiProvider)
      .where(eq(userAiProvider.userId, userId));
    const makeDefault =
      existing.length === 0 ||
      !existing.some((provider) => provider.isDefault) ||
      data.isDefault === true;
    if (makeDefault) await clearDefaultProvider(transaction, userId);
    return transaction
      .insert(userAiProvider)
      .values({
        id,
        userId,
        provider: data.provider,
        label: data.label ?? null,
        baseUrl: data.baseUrl ?? null,
        modelId,
        encryptedApiKey,
        keyLast4: keyLast4(data.apiKey),
        isDefault: makeDefault,
      })
      .returning();
  });
  if (!row) throw new Error("Failed to create provider.");
  return publicProvider(row);
}

export async function updateProvider(userId: string, id: string, data: UpdateProviderInput) {
  const [existing] = await db
    .select()
    .from(userAiProvider)
    .where(and(eq(userAiProvider.id, id), eq(userAiProvider.userId, userId)))
    .limit(1);
  if (!existing) return null;

  const nextModelId = data.modelId ?? existing.modelId;
  const nextBaseUrl = data.baseUrl === undefined ? existing.baseUrl : data.baseUrl;
  await assertProviderBaseUrl(existing.provider, nextBaseUrl);

  let encryptedApiKey = existing.encryptedApiKey;
  let last4 = existing.keyLast4;
  if (data.apiKey) {
    requireEncryptionReady();
    encryptedApiKey = encryptSecret(data.apiKey, {
      userId,
      providerId: existing.id,
      provider: existing.provider,
    });
    last4 = keyLast4(data.apiKey);
  }

  if (updateRequiresValidation(data)) {
    try {
      const apiKey =
        data.apiKey ??
        decryptSecret(existing.encryptedApiKey, {
          userId,
          providerId: existing.id,
          provider: existing.provider,
        });
      await validateCredentials({
        provider: existing.provider,
        apiKey,
        modelId: nextModelId,
        baseUrl: nextBaseUrl,
      });
    } catch (error) {
      if (error instanceof ByokEncryptionError) throw error;
      throw new ProviderConfigurationError(error);
    }
  }

  const [row] = await db.transaction(async (transaction) => {
    if (data.isDefault === true) await clearDefaultProvider(transaction, userId);
    return transaction
      .update(userAiProvider)
      .set({
        label: data.label === undefined ? existing.label : data.label,
        modelId: nextModelId,
        baseUrl: nextBaseUrl,
        encryptedApiKey,
        keyLast4: last4,
        isDefault: data.isDefault === true ? true : existing.isDefault,
      })
      .where(and(eq(userAiProvider.id, id), eq(userAiProvider.userId, userId)))
      .returning();
  });
  modelCache.delete(id);
  return row ? publicProvider(row) : null;
}

export function updateRequiresValidation(data: UpdateProviderInput) {
  return Boolean(data.apiKey) || Boolean(data.modelId) || data.baseUrl !== undefined;
}

export async function deleteProvider(userId: string, id: string) {
  const provider = await db.transaction(async (transaction) => {
    await transaction.execute(sql`select id from "user" where id = ${userId} for update`);
    const [existing] = await transaction
      .select()
      .from(userAiProvider)
      .where(and(eq(userAiProvider.id, id), eq(userAiProvider.userId, userId)))
      .limit(1);
    if (!existing) return null;
    await transaction
      .delete(userAiProvider)
      .where(and(eq(userAiProvider.id, id), eq(userAiProvider.userId, userId)));
    if (!existing.isDefault) return existing.provider;

    const [next] = await transaction
      .select()
      .from(userAiProvider)
      .where(eq(userAiProvider.userId, userId))
      .orderBy(asc(userAiProvider.createdAt), asc(userAiProvider.id))
      .limit(1);
    if (next) {
      await transaction
        .update(userAiProvider)
        .set({ isDefault: true })
        .where(eq(userAiProvider.id, next.id));
    }
    return existing.provider;
  });
  modelCache.delete(id);
  return provider;
}

export async function updatePreference(userId: string, preferredSource: PreferredAiSource) {
  const [row] = await db
    .insert(userAiPreference)
    .values({ userId, preferredSource })
    .onConflictDoUpdate({
      target: userAiPreference.userId,
      set: { preferredSource, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error("Failed to update preference.");
  return row.preferredSource;
}

function requireEncryptionReady() {
  if (!canEncryptByokKeys()) {
    throw new ByokEncryptionError(
      "Server is not configured for BYOK. Set BYOK_ENCRYPTION_KEY (openssl rand -base64 32).",
    );
  }
}

async function assertProviderBaseUrl(provider: string, baseUrl?: string | null) {
  if (provider !== "openai_compatible") {
    if (baseUrl) {
      throw new ProviderConfigurationError(
        new Error("Base URL is only supported for OpenAI-compatible providers."),
      );
    }
    return;
  }
  if (!baseUrl) {
    throw new ProviderConfigurationError(
      new Error("Base URL is required for OpenAI-compatible providers."),
    );
  }
  try {
    await assertSafeBaseUrl(baseUrl);
  } catch (error) {
    throw new ProviderConfigurationError(error);
  }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function clearDefaultProvider(transaction: Transaction, userId: string) {
  await transaction
    .update(userAiProvider)
    .set({ isDefault: false })
    .where(and(eq(userAiProvider.userId, userId), eq(userAiProvider.isDefault, true)));
}
