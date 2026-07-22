/** Validates all secrets and deployment settings consumed by the API server. */
import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    // Prod split deploy: set to the shared parent domain (e.g. ".vyse.site") so
    // the session cookie is shared across app.* (web) and api.* (server). Leave
    // unset locally -- localhost needs no cross-subdomain sharing.
    COOKIE_DOMAIN: z.string().min(1).optional(),
    // Groq platform models and orchestrator. A comma-separated key list can
    // spread requests across multiple free-tier accounts.
    GROQ_API_KEY: z.string().min(1).optional(),
    GROQ_API_KEYS: z.string().min(1).optional(),
    // Gemini remains the platform model/fallback when configured.
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    // AES-256-GCM key used to encrypt per-user BYOK credentials.
    BYOK_ENCRYPTION_KEY: z.string().min(1).optional(),
    // Rotation-ready keyring: comma-separated keyId=base64Key entries.
    BYOK_ENCRYPTION_KEYS: z.string().min(1).optional(),
    BYOK_ENCRYPTION_KEY_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
    AI_PLATFORM_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    COGNEE_BASE_URL: z.url().optional(),
    COGNEE_API_KEY: z.string().min(1).optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
