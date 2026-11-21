import { mock } from "bun:test";

// The env module validates every server secret on import (tools.ts and
// repo-ai.ts import it at module scope). Tests must never depend on real
// secrets, and CI has none: every key reads as unset.
mock.module("@OpenDiagram/env/server", () => ({ env: {} }));

// telemetry.ts also registers PostHog tracing on import.
mock.module("../../src/lib/telemetry", () => ({
  aiTelemetry: () => undefined,
}));
