/**
 * Gemini explicit context cache for the diagram agent's static head.
 *
 * ~5.4k tokens re-sent once per agent step. Implicit caching already discounts
 * it but only on a still-warm prefix -- measured, it hit on one dev step in five.
 * An explicit cache makes the 90% discount ($0.30 -> $0.03 per 1M) unconditional.
 *
 * The catch that shapes this file: the API refuses `cachedContent` alongside
 * `systemInstruction`, `tools` or `toolConfig`, so all three must be lifted out
 * of every outgoing body and into the cache. That is `createCachingFetch`.
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

/**
 * Heads the API refused as too small, until when. The layout fixer also sends
 * instructions plus tools, but its head is ~840 tokens against a 1,024 minimum:
 * without this every fixer step paid a `cachedContents` POST that could only
 * 400 (6 per fix pass, measured). Network and 5xx failures are not remembered.
 */
const tooSmall = new Map<string, number>();

type GeminiBody = {
  systemInstruction?: unknown;
  tools?: unknown;
  toolConfig?: unknown;
  cachedContent?: string;
};

/**
 * One key per (model, head), covering every field the cache stores. `model`
 * belongs in it because a Gemini cache is bound to the model that created it:
 * a second model reading the first's cache fails every call with "Model used by
 * GenerateContent request does not match", and there is no uncached fallback.
 * https://ai.google.dev/gemini-api/docs/caching#considerations
 */
function headKey(model: string, body: GeminiBody): string {
  return createHash("sha256")
    .update(
      JSON.stringify({ m: model, s: body.systemInstruction, t: body.tools, c: body.toolConfig }),
    )
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
    if (response.status === 400 && /too small/i.test(payload?.error?.message ?? ""))
      tooSmall.set(headKey(model, body), Date.now() + TTL_SECONDS * 1000);
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
  const key = headKey(model, body);
  const held = entries.get(key);
  if (held && held.expiresAt - REFRESH_MARGIN_MS > Date.now()) return held;
  if ((tooSmall.get(key) ?? 0) > Date.now()) return null;

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const creation = createCache(apiKey, model, body)
    // `createCache` turns an API-level failure into null itself; this covers the
    // request never completing, which must not take the diagram turn down with it.
    .catch((error) => {
      log("warn", "context cache request failed, falling back to inline head", { error });
      return null;
    })
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
 * PLATFORM KEY ONLY: a cache is readable only by the key that created it, so a
 * BYOK user would pay hourly storage for a cache nobody else can hit.
 *
 * Awaits the first creation rather than warming in the background, so the request
 * that pays to build the cache is also the first to read it -- and so the work
 * stays inside the request, which Cloud Run needs (CPU throttles after response).
 */
export function createCachingFetch(
  apiKey: string,
  model: string,
  // Generation calls go through `send`; the cache's own POSTs never do, so a
  // recorder passed here times the model, not cache warm-up.
  send: FetchFunction = fetch,
): FetchFunction {
  const cachingFetch = async (
    input: Parameters<FetchFunction>[0],
    init?: Parameters<FetchFunction>[1],
  ): Promise<Response> => {
    if (typeof init?.body !== "string") return send(input, init);

    const body = JSON.parse(init.body) as GeminiBody;
    // Cache only the diagram agent's head. It is the one platform call that
    // declares tools, and the only one clearing Gemini 2.5 Flash's 2,048-token
    // cache minimum -- project chat and repo generation send a few hundred tokens
    // of system prompt, so they would spend a round trip per request on a
    // `cachedContents` POST that can only fail. Token counts carry no head at all.
    if (!body.systemInstruction || !body.tools) return send(input, init);

    const entry = await cacheFor(apiKey, model, body);
    if (!entry) return send(input, init);

    body.cachedContent = entry.name;
    delete body.systemInstruction;
    delete body.tools;
    delete body.toolConfig;

    return send(input, { ...init, body: JSON.stringify(body) });
  };

  // `preconnect` rides along on Bun's `fetch` type, which is the shape the
  // provider option asks for. Forwarded to the real implementation rather than
  // stubbed, so anything reaching for it gets working behaviour.
  return Object.assign(cachingFetch, { preconnect: fetch.preconnect });
}

/** One model HTTP attempt as the provider made it; retries show up as extra rows. 0: no response. */
export type ModelCall = { status: number; ms: number };

/**
 * Wraps a provider `fetch` to record every attempt into `calls`. The AI SDK
 * retries 503/429 inside one step and exposes no count, so a step that sits
 * silent for minutes is otherwise indistinguishable from one slow call.
 * `ms` is time to response headers: for a stream, time to first byte.
 */
export function recordCalls(inner: FetchFunction, calls: ModelCall[]): FetchFunction {
  const recording = async (...args: Parameters<FetchFunction>) => {
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    try {
      const response = await inner(...args);
      calls.push({ status: response.status, ms: elapsed() });
      return response;
    } catch (error) {
      // No response at all (network, abort): status 0, so it still counts.
      calls.push({ status: 0, ms: elapsed() });
      throw error;
    }
  };
  return Object.assign(recording, { preconnect: fetch.preconnect });
}
