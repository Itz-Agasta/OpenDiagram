/** Provides a small per-process fixed-window guard for credential-check requests. */

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

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

  if (buckets.size > 10_000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
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
}
