/**
 * Dev-only client telemetry (evlog).
 *
 * Tracks API call durations (incl. auth) and page/route load times.
 * All exports no-op or pass through in production (`import.meta.env.DEV`).
 *
 * Delete: remove this folder + the few call sites listed in README.md.
 */

import { getDevFetch } from "./fetch";
import { log } from "./logger";
import { trackPageLoads, trackRouter } from "./page";

export { getDevFetch, log, trackPageLoads, trackRouter };

export const devTelemetry = {
  enabled: import.meta.env.DEV as boolean,
  getDevFetch,
  log,
  trackPageLoads,
  trackRouter,
  logQueryError(error: unknown, queryKey: readonly unknown[]) {
    if (!import.meta.env.DEV) return;
    log.error({
      type: "query_error",
      queryKey: queryKey.map(String),
      message: `Query error: ${queryKey.map(String).join("/")}`,
      error: error instanceof Error ? error.message : String(error),
    });
  },
  logMutationError(error: unknown, mutationKey: readonly unknown[] | undefined) {
    if (!import.meta.env.DEV) return;
    const key = mutationKey?.map(String) ?? ["unnamed"];
    log.error({
      type: "mutation_error",
      mutationKey: key,
      message: `Mutation error: ${key.join("/")}`,
      error: error instanceof Error ? error.message : String(error),
    });
  },
};
