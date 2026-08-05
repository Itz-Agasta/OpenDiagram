import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_SERVER_URL: z.url(),
    NEXT_PUBLIC_ASSET_URL: z.url(),
    // Fraction of traces sampled, 0..1. Full sampling by default. The DSN stays
    // hardcoded in apps/web/sentry.dsn.ts.
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
    // Optional on purpose: unset = no tracker render, so local/preview stays
    // out of production stats.
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    NEXT_PUBLIC_ASSET_URL: process.env.NEXT_PUBLIC_ASSET_URL,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
