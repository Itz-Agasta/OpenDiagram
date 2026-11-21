import { mock } from "bun:test";

// telemetry.ts validates the server env and registers PostHog tracing on import.
// Tests need neither, and CI has no .env.
mock.module("../../src/lib/telemetry", () => ({
  aiTelemetry: () => undefined,
}));
