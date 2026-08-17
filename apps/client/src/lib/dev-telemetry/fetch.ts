/**
 * DEV-only instrumented fetch: logs method, path, status, durationMs.
 * Production returns the platform fetch unchanged.
 */

import { log } from "./logger";

function resolvePath(input: RequestInfo | URL): string {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(raw, base);
    return `${url.pathname}${url.search}`;
  } catch {
    return String(input);
  }
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Returns an instrumented fetch in DEV, or global fetch in production.
 * Never logs bodies/headers.
 */
export function getDevFetch(
  baseFetch: FetchLike = globalThis.fetch.bind(globalThis) as FetchLike,
): FetchLike {
  if (!import.meta.env.DEV) return baseFetch;

  const instrumented: FetchLike = async (input, init) => {
    const method = resolveMethod(input, init);
    const path = resolvePath(input);
    // Don't log the log-ingest endpoint (would recurse / flood).
    const skipLog = path === "/__dev/evlog" || path.startsWith("/__dev/evlog?");
    const start = performance.now();

    try {
      const response = await baseFetch(input, init);
      if (skipLog) return response;
      const durationMs = Math.round(performance.now() - start);
      const payload = {
        type: "api" as const,
        method,
        path,
        status: response.status,
        durationMs,
        ok: response.ok,
      };

      if (response.ok) {
        log.info(payload);
      } else {
        log.error({
          ...payload,
          message: `API ${method} ${path} → ${response.status}`,
        });
      }

      return response;
    } catch (err) {
      if (skipLog) throw err;
      const durationMs = Math.round(performance.now() - start);
      log.error({
        type: "api",
        method,
        path,
        durationMs,
        ok: false,
        message: `API ${method} ${path} network error`,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  return instrumented;
}
