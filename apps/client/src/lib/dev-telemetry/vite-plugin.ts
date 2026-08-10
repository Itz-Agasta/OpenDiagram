/**
 * Vite-only middleware: receives browser evlog batches and writes NDJSON via
 * createFsDrain → monorepo root `.evlog/logs/`.
 *
 * Apply: `apply: "serve"` — never included in production builds.
 * Delete with this folder when removing client telemetry.
 */

import type { Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFsDrain } from "evlog/fs";

const INGEST_PATH = "/__dev/evlog";

/** Monorepo root (…/OpenDiagram) from this file at apps/client/src/lib/dev-telemetry/ */
function monorepoLogDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // apps/client/src/lib/dev-telemetry → 5 levels up → repo root
  return path.resolve(here, "../../../../../.evlog/logs");
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Dev-only Vite plugin. POST JSON batches (DrainContext[]) to `/__dev/evlog`.
 */
export function devEvlogFilePlugin(): Plugin {
  return {
    name: "dev-evlog-file",
    apply: "serve",
    configureServer(server) {
      const dir = monorepoLogDir();
      const fsDrain = createFsDrain({ dir });

      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split("?")[0] !== INGEST_PATH) {
          next();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        try {
          const raw = await readBody(req);
          const parsed: unknown = JSON.parse(raw || "[]");
          const batch = Array.isArray(parsed) ? parsed : [parsed];

          // createHttpDrain posts DrainContext[] — each item has `.event`
          const contexts = batch.map((item) => {
            if (item && typeof item === "object" && "event" in item) {
              return item as { event: Record<string, unknown> };
            }
            // plain event object fallback
            return { event: item as Record<string, unknown> };
          });

          if (contexts.length > 0) {
            await fsDrain(contexts as Parameters<typeof fsDrain>[0]);
          }

          res.statusCode = 204;
          res.end();
        } catch (err) {
          console.error("[dev-evlog-file] failed to write log:", err);
          res.statusCode = 500;
          res.end("evlog write failed");
        }
      });
    },
  };
}

export const DEV_EVLOG_INGEST_PATH = INGEST_PATH;
