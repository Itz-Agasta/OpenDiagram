import { mock } from "bun:test";

// The env module validates every server secret on import (tools.ts and
// repo-ai.ts import it at module scope). Tests must never depend on real
// secrets, and CI has none: every key reads as unset.
mock.module("@OpenDiagram/env/server", () => ({ env: {} }));

// telemetry.ts also registers PostHog tracing on import.
mock.module("../../src/lib/telemetry", () => ({
  aiTelemetry: () => undefined,
}));

// The db singleton opens a pg Pool against DATABASE_URL. Tests get PGlite
// instead, built from the real migrations (support/db.ts).
mock.module("@OpenDiagram/db", async () => {
  const { testDb } = await import("./db");
  const orm = await import("drizzle-orm");
  const { and, desc, eq, exists, inArray, lt, ne, notInArray, or, sql } = orm;
  return { db: testDb, and, desc, eq, exists, inArray, lt, ne, notInArray, or, sql };
});
