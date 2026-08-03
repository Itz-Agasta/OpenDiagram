/**
 * Gemini explicit context cache for the diagram agent's static head.
 *
 * The system prompt is ~5.4k tokens, three quarters of it the icon catalog, and
 * it is re-sent once per agent step. Implicit caching already discounts it, but
 * only when a matching prefix happens to still be warm -- measured across 122
 * dev steps it hit on roughly one in five. An explicit cache makes the same 90%
 * discount ($0.30 -> $0.03 per 1M input tokens on 2.5 Flash) unconditional.
 *
 * The catch that shapes this whole file: the API refuses a request that carries
 * `cachedContent` alongside `systemInstruction`, `tools` or `tool_config` --
 * "Proposed fix: move those values to CachedContent from GenerateContent
 * request." So the three fields have to be lifted OUT of every outgoing body and
 * INTO the cache, which is what `createCachingFetch` does.
 * https://ai.google.dev/gemini-api/docs/generate-content/caching#considerations
 */
import { createHash } from "node:crypto";
import type { createGoogle } from "@ai-sdk/google";
import { createLogger } from "evlog";

/** Read off the provider rather than imported: `@ai-sdk/provider-utils` is not a direct dep. */
type FetchFunction = NonNullable<NonNullable<Parameters<typeof createGoogle>[0]>["fetch"]>;

/** Long enough that a cache outlives a working session; storage is $1/1M tokens/hour. */
const TTL_SECONDS = 3600;

/** Rebuild this far before expiry, so a request never races the deletion. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function log(level: "info" | "warn", message: string, fields?: Record<string, unknown>) {
  // `module` last: a caller's `fields` must not be able to rename the module.
  const entry = createLogger({ ...fields, module: "agent-cache" });
  entry[level](message);
  entry.emit();
}

type CacheEntry = { name: string; expiresAt: number };

/**
 * One cache per distinct head, keyed by a hash of it. Module-level rather than
 * per-model-instance: `resolvePlatformModel()` builds a fresh provider on every
 * request, so anything held on that object would be thrown away each time.
 */
const entries = new Map<string, CacheEntry>();

/** In-flight creations, so concurrent first requests build one cache, not N. */
const pending = new Map<string, Promise<CacheEntry | null>>();

type GeminiBody = {
  systemInstruction?: unknown;
  tools?: unknown;
  toolConfig?: unknown;
  cachedContent?: string;
};

function headKey(body: GeminiBody): string {
  return createHash("sha256")
    .update(JSON.stringify({ s: body.systemInstruction, t: body.tools }))
    .digest("hex");
}

async function createCache(
  apiKey: string,
  model: string,
  body: GeminiBody,
): Promise<CacheEntry | null> {
  // The tool declarations come from the body the SDK just built rather than from
  // a hand-written copy of `diagramSpecSchema`. A second copy would be a second
  // thing to keep in step with the Zod schema, and a cached declaration that has
  // drifted from the live one breaks tool calls in ways the type system cannot
  // see.
  const response = await fetch(`${BASE_URL}/cachedContents?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: `models/${model}`,
      displayName: "opendiagram-diagram-agent",
      systemInstruction: body.systemInstruction,
      tools: body.tools,
      toolConfig: body.toolConfig,
      ttl: `${TTL_SECONDS}s`,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    name?: string;
    usageMetadata?: { totalTokenCount?: number };
    error?: { message?: string };
  } | null;

  if (!response.ok || !payload?.name) {
    // Not fatal: the caller sends the head inline instead and pays full price.
    // Worth a line though -- a persistent failure here is a silent bill increase,
    // and the usual cause is the head falling under the model's 2,048-token
    // minimum for caching.
    log("warn", "context cache creation failed, falling back to inline head", {
      cache: { status: response.status, detail: payload?.error?.message },
    });
    return null;
  }

  log("info", "created context cache", {
    cache: { name: payload.name, tokens: payload.usageMetadata?.totalTokenCount },
  });
  return { name: payload.name, expiresAt: Date.now() + TTL_SECONDS * 1000 };
}

async function cacheFor(
  apiKey: string,
  model: string,
  body: GeminiBody,
): Promise<CacheEntry | null> {
  const key = headKey(body);
  const held = entries.get(key);
  if (held && held.expiresAt - REFRESH_MARGIN_MS > Date.now()) return held;

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const creation = createCache(apiKey, model, body)
    .then((entry) => {
      if (entry) entries.set(key, entry);
      // A stale entry for this key is now either replaced or known-bad; either
      // way it must not be reused.
      else entries.delete(key);
      return entry;
    })
    .finally(() => pending.delete(key));

  pending.set(key, creation);
  return creation;
}

/**
 * A `fetch` for `createGoogle` that routes generation through a context cache.
 *
 * PLATFORM KEY ONLY. A cache belongs to the key that created it, so this must
 * never wrap a BYOK provider: those users would pay storage for a cache only
 * their own requests could read, and there is no shared prefix across them.
 *
 * Awaits the first creation rather than warming in the background, so the
 * request that pays to build the cache is also the first to read from it. That
 * also keeps the work inside the request, which Cloud Run requires -- CPU is
 * throttled once a response completes.
 */
export function createCachingFetch(apiKey: string, model: string): FetchFunction {
  const cachingFetch = async (
    input: Parameters<FetchFunction>[0],
    init?: Parameters<FetchFunction>[1],
  ): Promise<Response> => {
    if (typeof init?.body !== "string") return fetch(input, init);

    const body = JSON.parse(init.body) as GeminiBody;
    // Requests without a system instruction are not the agent loop (token counts,
    // for one) and have no head worth caching.
    if (!body.systemInstruction) return fetch(input, init);

    const entry = await cacheFor(apiKey, model, body);
    if (!entry) return fetch(input, init);

    body.cachedContent = entry.name;
    delete body.systemInstruction;
    delete body.tools;
    delete body.toolConfig;

    return fetch(input, { ...init, body: JSON.stringify(body) });
  };

  // `preconnect` rides along on Bun's `fetch` type, which is the shape the
  // provider option asks for. Forwarded to the real implementation rather than
  // stubbed, so anything reaching for it gets working behaviour.
  return Object.assign(cachingFetch, { preconnect: fetch.preconnect });
}
