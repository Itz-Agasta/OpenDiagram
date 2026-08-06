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
    // Prod split deploy: set to the shared parent domain ("opendiagram.ink") so
    // the session cookie is shared between the web app on the apex and the API on
    // its subdomain. Leave unset locally -- localhost needs no cross-subdomain
    // sharing. Every entry in CORS_ORIGIN must sit under this domain: the cookies
    // are SameSite=Lax, so a genuinely cross-site origin would not receive them.
    COOKIE_DOMAIN: z.string().min(1).optional(),
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
    // Dodo Payments - OPTIONAL. Unset disables billing entirely (the self-host
    // default): checkout/webhook routes 404 and every account is treated as
    // Free. Product IDs and the webhook secret are per-mode, so switching
    // test_mode -> live_mode means swapping these four values, not code.
    DODO_PAYMENTS_API_KEY: z.string().min(1).optional(),
    DODO_WEBHOOK_SECRET: z.string().min(1).optional(),
    DODO_PRO_PRODUCT_ID: z.string().min(1).optional(),
    // These are the SDK's own `Environment` values, used verbatim so the client
    // takes the env value with no mapping layer in between.
    DODO_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).default("test_mode"),
    // Resend - OPTIONAL. Unset means no verification mail is sent, so accounts
    // stay unverified and sit on the guest allowance (see lib/quota/actor.ts).
    // RESEND_FROM must be on a domain verified in Resend; the `onboarding@
    // resend.dev` fallback only delivers to the Resend account owner's own
    // address, which is enough for local testing and nothing else.
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM: z.string().min(1).default("OpenDiagram <onboarding@resend.dev>"),
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
