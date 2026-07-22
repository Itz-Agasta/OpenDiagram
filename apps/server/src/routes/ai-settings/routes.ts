/** HTTP endpoints for BYOK provider settings, preferences, and provider probes. */
import { Hono, type Context } from "hono";
import { canEncryptByokKeys } from "../../lib/ai-provider";
import { ByokEncryptionError } from "../../lib/ai-provider/encrypt";
import { enabledByokProviders } from "../../lib/ai-provider/provider-catalog";
import type { AuthVariables } from "../../lib/require-auth";
import { recordByokOutcome, safeError, providerRequestLimit } from "./middleware";
import {
  createProvider,
  deleteProvider,
  getProviderSettings,
  getSavedProviderModels,
  ProviderConfigurationError,
  updatePreference,
  updateProvider,
  updateRequiresValidation,
} from "./provider-service";
import { discoverModels, modelIdFor, validateCredentials } from "./validation";
import {
  createProviderSchema,
  listModelsSchema,
  preferenceSchema,
  updateProviderSchema,
  validateProviderSchema,
} from "./schemas";

export const aiSettingsRoutes = new Hono<{ Variables: AuthVariables }>();

aiSettingsRoutes.get("/providers", async (c) => {
  const settings = await getProviderSettings(c.get("userId"));
  return c.json({
    encryptionReady: canEncryptByokKeys(),
    enabledProviders: enabledByokProviders,
    ...settings,
  });
});

aiSettingsRoutes.get(
  "/providers/:id/models",
  providerRequestLimit("list_saved_models"),
  async (c) => {
    const startedAt = performance.now();
    const operation = "list_saved_models";
    try {
      const models = await getSavedProviderModels(c.get("userId"), c.req.param("id"));
      if (!models) return c.json({ error: "Not found" }, 404);
      recordByokOutcome(c.get("log"), {
        operation,
        result: "success",
        startedAt,
        modelCount: models.length,
      });
      return c.json({ models });
    } catch (error) {
      recordByokOutcome(c.get("log"), { operation, result: "error", startedAt });
      c.get("log").warn("Saved provider model discovery failed", {
        byok: { operation },
        error: safeError(error),
      });
      const response = providerErrorResponse(c, error);
      if (response) return response;
      return c.json({ error: "Could not load provider models.", code: "list_models_failed" }, 400);
    }
  },
);

aiSettingsRoutes.post("/providers", providerRequestLimit("create_provider"), async (c) => {
  const startedAt = performance.now();
  const operation = "create_provider";
  const parsed = createProviderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);

  try {
    const provider = await createProvider(c.get("userId"), parsed.data);
    recordByokOutcome(c.get("log"), {
      operation,
      provider: parsed.data.provider,
      result: "success",
      startedAt,
    });
    return c.json({ provider }, 201);
  } catch (error) {
    recordFailure(c, operation, parsed.data.provider, startedAt, error);
    const response = providerErrorResponse(c, error);
    if (response) return response;
    throw error;
  }
});

aiSettingsRoutes.patch(
  "/providers/:id",
  providerRequestLimit("update_provider", async (request) => {
    const parsed = updateProviderSchema.safeParse(await request.json().catch(() => null));
    return parsed.success && updateRequiresValidation(parsed.data);
  }),
  async (c) => {
    const startedAt = performance.now();
    const operation = "update_provider";
    const parsed = updateProviderSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);

    try {
      const provider = await updateProvider(c.get("userId"), c.req.param("id"), parsed.data);
      if (!provider) return c.json({ error: "Not found" }, 404);
      recordByokOutcome(c.get("log"), {
        operation,
        provider: provider.provider,
        result: "success",
        startedAt,
      });
      return c.json({ provider });
    } catch (error) {
      recordFailure(c, operation, undefined, startedAt, error);
      const response = providerErrorResponse(c, error);
      if (response) return response;
      throw error;
    }
  },
);

aiSettingsRoutes.delete("/providers/:id", async (c) => {
  const startedAt = performance.now();
  const provider = await deleteProvider(c.get("userId"), c.req.param("id"));
  if (!provider) return c.json({ error: "Not found" }, 404);
  recordByokOutcome(c.get("log"), {
    operation: "delete_provider",
    provider,
    result: "success",
    startedAt,
  });
  return c.json({ ok: true });
});

aiSettingsRoutes.patch("/preferences", async (c) => {
  const startedAt = performance.now();
  const parsed = preferenceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  const preferredSource = await updatePreference(c.get("userId"), parsed.data.preferredSource);
  recordByokOutcome(c.get("log"), { operation: "update_preference", result: "success", startedAt });
  return c.json({ preferredSource });
});

aiSettingsRoutes.post(
  "/providers/validate",
  providerRequestLimit("validate_credentials"),
  async (c) => {
    const startedAt = performance.now();
    const parsed = validateProviderSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
    const modelId = modelIdFor(parsed.data.provider, parsed.data.modelId);
    try {
      await validateCredentials({ ...parsed.data, modelId });
      recordByokOutcome(c.get("log"), {
        operation: "validate_credentials",
        provider: parsed.data.provider,
        result: "success",
        startedAt,
      });
      return c.json({ ok: true, modelId });
    } catch (error) {
      return probeFailure(
        c,
        "validate_credentials",
        parsed.data.provider,
        startedAt,
        error,
        "Validation failed",
      );
    }
  },
);

aiSettingsRoutes.post("/providers/models", providerRequestLimit("list_models"), async (c) => {
  const startedAt = performance.now();
  const parsed = listModelsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  try {
    const models = await discoverModels(parsed.data);
    recordByokOutcome(c.get("log"), {
      operation: "list_models",
      provider: parsed.data.provider,
      result: "success",
      startedAt,
      modelCount: models.length,
    });
    return c.json({ models });
  } catch (error) {
    return probeFailure(
      c,
      "list_models",
      parsed.data.provider,
      startedAt,
      error,
      "Could not list models",
      "list_models_failed",
    );
  }
});

type SettingsContext = Context<{ Variables: AuthVariables }>;

function providerErrorResponse(c: SettingsContext, error: unknown) {
  if (error instanceof ByokEncryptionError)
    return c.json({ error: error.message, code: "byok_not_configured" }, 503);
  if (error instanceof ProviderConfigurationError)
    return c.json({ error: error.message, code: error.code }, 400);
  return null;
}

function recordFailure(
  c: SettingsContext,
  operation: string,
  provider: Parameters<typeof recordByokOutcome>[1]["provider"],
  startedAt: number,
  error: unknown,
) {
  recordByokOutcome(c.get("log"), { operation, provider, result: "error", startedAt });
  c.get("log").warn("BYOK provider mutation failed", {
    byok: { operation, provider },
    error: safeError(error),
  });
}

function probeFailure(
  c: SettingsContext,
  operation: string,
  provider: Parameters<typeof recordByokOutcome>[1]["provider"],
  startedAt: number,
  error: unknown,
  fallback: string,
  code?: string,
) {
  recordByokOutcome(c.get("log"), { operation, provider, result: "error", startedAt });
  c.get("log").warn("BYOK provider probe failed", {
    byok: { operation, provider },
    error: safeError(error),
  });
  return c.json(
    { error: error instanceof Error ? error.message : fallback, ...(code ? { code } : {}) },
    400,
  );
}
