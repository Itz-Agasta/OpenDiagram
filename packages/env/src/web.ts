import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    NEXT_PUBLIC_ASSET_URL: z.url().optional(),
    NEXT_PUBLIC_ASSET_URL: z.url(),
    // Fraction of traces sampled, 0..1. Full sampling by default. The DSN stays
    // hardcoded in apps/web/sentry.dsn.ts.
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    NEXT_PUBLIC_ASSET_URL: process.env.NEXT_PUBLIC_ASSET_URL,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
