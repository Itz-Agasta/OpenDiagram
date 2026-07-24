import { OpenTelemetry } from "@ai-sdk/otel";
import { registerTelemetry } from "ai";

// Sentry's vercelAIIntegration instruments AI SDK v7 through the Node.js
// diagnostics tracing channel, which Bun does not implement — verified against
// a live Gemini call that produced zero gen_ai spans. The AI SDK's own
// OpenTelemetry integration does not need that channel: it emits GenAI SemConv
// spans through the @opentelemetry/api singleton, and @sentry/bun registers a
// SentryTracerProvider there, so the spans land in Sentry's AI Agents views.
// The Sentry integration is disabled in index.ts so the two can't double up.
registerTelemetry(new OpenTelemetry());

/**
 * Per-call telemetry settings for AI SDK calls.
 *
 * Metadata only: model, token counts, latency, and tool names reach Sentry;
 * prompts and completions never leave the server. The AI SDK records both by
 * default, so the opt-out has to be explicit on every call.
 */
export function aiTelemetry(functionId: string) {
  return { functionId, recordInputs: false, recordOutputs: false };
}
