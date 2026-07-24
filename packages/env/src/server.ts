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
    // Orchestrator intent classifier (optional — degrades to regex if unset).
    GROQ_API_KEY: z.string().min(1).optional(),
    // All LLM tasks (diagrams, docs, analysis, chat) run on Gemini.
    // Functionally required in prod.
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    // Kimi / OpenAI-compatible gateway — currently unused (all tasks on Gemini).
    // Kept for easy re-enable; safe to leave unset.
    CUSTOM_AI_API_KEY: z.string().min(1).optional(),
    CUSTOM_AI_BASE_URL: z.url().optional(),
    CUSTOM_AI_MODEL: z.string().min(1).optional(),
    // BYOK: base64-encoded 32-byte key that encrypts stored user API keys at rest
    // (openssl rand -base64 32). BYOK settings are disabled when unset.
    BYOK_ENCRYPTION_KEY: z.string().min(1).optional(),
    COGNEE_BASE_URL: z.url().optional(),
    COGNEE_API_KEY: z.string().min(1).optional(),
    // Fraction of traces sampled, 0..1. Full sampling by default: gen_ai runs
    // are sampled as a whole span tree, so dropping a root span loses the
    // entire agent run. Lower it here if span volume becomes a problem.
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
