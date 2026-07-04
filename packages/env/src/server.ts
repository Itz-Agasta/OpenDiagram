import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    GROQ_API_KEY: z.string().min(1).optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    AI_PROVIDER: z.enum(["google", "custom"]).default("google"),
    CUSTOM_AI_API_KEY: z.string().min(1).optional(),
    CUSTOM_AI_BASE_URL: z.string().url().optional(),
    CUSTOM_AI_MODEL: z.string().min(1).optional(),
    COGNEE_LLM_PROVIDER: z.string().min(1).optional(),
    COGNEE_LLM_MODEL: z.string().min(1).optional(),
    COGNEE_LLM_API_KEY: z.string().min(1).optional(),
    COGNEE_LLM_ENDPOINT: z.url().optional(),
    COGNEE_EMBEDDING_PROVIDER: z.string().min(1).optional(),
    COGNEE_EMBEDDING_MODEL: z.string().min(1).optional(),
    COGNEE_EMBEDDING_API_KEY: z.string().min(1).optional(),
    COGNEE_EMBEDDING_ENDPOINT: z.url().optional(),
    COGNEE_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().optional(),
    COGNEE_USE_MOCK_EMBEDDINGS: z.coerce.boolean().default(false),
    COGNEE_BACKEND: z.enum(["cloud", "local"]).default("cloud"),
    COGNEE_API_KEY: z.string().min(1).optional(),
    COGNEE_BASE_URL: z.url().optional(),
    COGNEE_CLOUD_API_KEY: z.string().min(1).optional(),
    COGNEE_CLOUD_BASE_URL: z.url().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
