/** Provides a small per-process fixed-window guard for credential-check requests. */

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;
let nextCleanupAt = 0;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now = Date.now(),
): RateLimitResult {
  const current = buckets.get(key);
  const bucket =
    !current || current.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : current;
  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > MAX_BUCKETS && now >= nextCleanupAt) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    nextCleanupAt = now + CLEANUP_INTERVAL_MS;
  }
  if (buckets.size > MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey && oldestKey !== key) buckets.delete(oldestKey);
  }

  return {
    allowed: bucket.count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function resetRateLimitsForTests() {
  buckets.clear();
  nextCleanupAt = 0;
}
