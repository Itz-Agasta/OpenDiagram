/**
 * DEV-only evlog init. Production: no-ops (initLogger never runs).
 *
 * Console: pretty trees in the browser.
 * File: HTTP drain → Vite `/__dev/evlog` → monorepo `.evlog/logs/*.jsonl`
 *
 * Delete with this entire folder when shipping without client telemetry.
 */

import { initLogger, log as evlogLog } from "evlog";
import { createHttpLogDrain } from "evlog/http";

type LogApi = {
  info: (data: Record<string, unknown>) => void;
  error: (data: Record<string, unknown>) => void;
  warn: (data: Record<string, unknown>) => void;
  debug: (data: Record<string, unknown>) => void;
};

const noop: LogApi = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};

const enabled = import.meta.env.DEV;

if (enabled) {
  // Browser (and any client code) → Vite middleware → createFsDrain → .evlog/logs
  // Small batch / short interval so files update quickly while debugging.
  const drain = createHttpLogDrain({
    drain: {
      endpoint: "/__dev/evlog",
      useBeacon: true,
      credentials: "same-origin",
    },
    pipeline: {
      batch: { size: 1, intervalMs: 100 },
      retry: { maxAttempts: 2 },
    },
  });

  initLogger({
    env: {
      service: "client-app-dev",
      environment: import.meta.env.MODE || "development",
    },
    drain,
  });
}

export const log: LogApi = enabled
  ? {
      info: (data) => evlogLog.info(data),
      error: (data) => evlogLog.error(data),
      warn: (data) => evlogLog.warn(data),
      debug: (data) => evlogLog.debug(data),
    }
  : noop;
