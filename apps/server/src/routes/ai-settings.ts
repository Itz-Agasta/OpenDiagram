/** BYOK settings: list the catalog, connect/update/remove a user's own provider key. */
import { and, db, eq } from "@OpenDiagram/db";
import { userAiProvider, userAiProviderKinds } from "@OpenDiagram/db/schema/user-ai-provider";
import { generateText } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import {
  ByokEncryptionError,
  canEncryptByokKeys,
  encryptSecret,
  keyLast4,
} from "../lib/ai-provider/encrypt";
import { getProvider, isKnownModel, listProviders } from "../lib/ai-provider/registry";
import { requireAuth, type AuthVariables } from "../lib/require-auth";

export const aiSettingsRoute = new Hono<{ Variables: AuthVariables }>();

aiSettingsRoute.use("*", requireAuth);

const connectSchema = z.object({
  provider: z.enum(userAiProviderKinds),
  apiKey: z.string().trim().min(8).max(512),
  modelId: z.string().trim().min(1).max(120).optional(),
});

const updateSchema = z
  .object({
    modelId: z.string().trim().min(1).max(120).optional(),
    makeDefault: z.literal(true).optional(),
  })
  .refine((v) => v.modelId !== undefined || v.makeDefault !== undefined, {
    message: "Nothing to update.",
  });

/** Row shape safe to return to the client — never the encrypted key. */
function publicProvider(row: typeof userAiProvider.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    modelId: row.modelId,
    keyLast4: row.keyLast4,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
  };
}

/** Confirm a key actually works before we store it (cheap 1-token call). */
async function assertKeyWorks(provider: string, apiKey: string, modelId: string) {
  const def = getProvider(provider);
  if (!def) throw new Error("Unknown provider.");
  await generateText({
    model: def.createModel(apiKey, modelId),
    prompt: "Reply with the single character: ok",
    maxOutputTokens: 8,
    maxRetries: 0,
  });
}

aiSettingsRoute.get("/providers", async (c) => {
  const rows = await db
    .select()
    .from(userAiProvider)
    .where(eq(userAiProvider.userId, c.get("userId")));
  rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return c.json({
    encryptionReady: canEncryptByokKeys(),
    catalog: listProviders().map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      docsUrl: p.docsUrl,
      keyPlaceholder: p.keyPlaceholder,
      models: p.models,
    })),
    providers: rows.map(publicProvider),
  });
});

aiSettingsRoute.post("/providers", async (c) => {
  if (!canEncryptByokKeys()) {
    return c.json({ error: "Server is not configured for BYOK.", code: "byok_disabled" }, 503);
  }
  const parsed = connectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);

  const def = getProvider(parsed.data.provider);
  if (!def) return c.json({ error: "Unknown provider." }, 400);
  const modelId = parsed.data.modelId ?? def.models[0]!.id;
  if (!isKnownModel(def, modelId)) return c.json({ error: "Unsupported model." }, 400);

  try {
    await assertKeyWorks(def.id, parsed.data.apiKey, modelId);
  } catch (error) {
    return c.json({ error: keyErrorMessage(error), code: "key_validation_failed" }, 400);
  }

  const userId = c.get("userId");
  const id = crypto.randomUUID();
  const encryptedApiKey = encryptSecret(parsed.data.apiKey, {
    userId,
    providerId: id,
    provider: def.id,
  });

  const row = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: userAiProvider.id })
      .from(userAiProvider)
      .where(eq(userAiProvider.userId, userId));
    const makeDefault = existing.length === 0;
    const [inserted] = await tx
      .insert(userAiProvider)
      .values({
        id,
        userId,
        provider: def.id,
        modelId,
        encryptedApiKey,
        keyLast4: keyLast4(parsed.data.apiKey),
        isDefault: makeDefault,
      })
      .returning();
    return inserted;
  });

  if (!row) return c.json({ error: "Failed to save provider." }, 500);
  return c.json({ provider: publicProvider(row) }, 201);
});

aiSettingsRoute.patch("/providers/:id", async (c) => {
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);

  const userId = c.get("userId");
  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(userAiProvider)
    .where(and(eq(userAiProvider.id, id), eq(userAiProvider.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);

  if (parsed.data.modelId !== undefined) {
    const def = getProvider(existing.provider);
    if (!def || !isKnownModel(def, parsed.data.modelId)) {
      return c.json({ error: "Unsupported model." }, 400);
    }
  }

  const row = await db.transaction(async (tx) => {
    if (parsed.data.makeDefault) {
      await tx
        .update(userAiProvider)
        .set({ isDefault: false })
        .where(and(eq(userAiProvider.userId, userId), eq(userAiProvider.isDefault, true)));
    }
    const [updated] = await tx
      .update(userAiProvider)
      .set({
        modelId: parsed.data.modelId ?? existing.modelId,
        isDefault: parsed.data.makeDefault ? true : existing.isDefault,
      })
      .where(and(eq(userAiProvider.id, id), eq(userAiProvider.userId, userId)))
      .returning();
    return updated;
  });

  return row ? c.json({ provider: publicProvider(row) }) : c.json({ error: "Not found" }, 404);
});

aiSettingsRoute.delete("/providers/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const deleted = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(userAiProvider)
      .where(and(eq(userAiProvider.id, id), eq(userAiProvider.userId, userId)))
      .limit(1);
    if (!existing) return null;
    await tx.delete(userAiProvider).where(eq(userAiProvider.id, id));
    // If we removed the default, promote the next-oldest so the user still has one.
    if (existing.isDefault) {
      const [next] = await tx
        .select({ id: userAiProvider.id })
        .from(userAiProvider)
        .where(eq(userAiProvider.userId, userId))
        .orderBy(userAiProvider.createdAt)
        .limit(1);
      if (next) {
        await tx
          .update(userAiProvider)
          .set({ isDefault: true })
          .where(eq(userAiProvider.id, next.id));
      }
    }
    return existing;
  });

  return deleted ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
});

function keyErrorMessage(error: unknown): string {
  if (error instanceof ByokEncryptionError) return error.message;
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid api key")) {
    return "That API key was rejected by the provider.";
  }
  return "Could not verify that key. Check it and try again.";
}
