import { OpenTelemetry } from "@ai-sdk/otel";
import { env } from "@OpenDiagram/env/server";
import { AlwaysOnSampler, BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { PostHogSpanProcessor } from "@posthog/ai/otel";
import { registerTelemetry } from "ai";

// Sentry's vercelAIIntegration instruments AI SDK v7 through the Node.js
// diagnostics tracing channel, which Bun does not implement. Verified against
// a live Gemini call that produced zero gen_ai spans. The AI SDK's own
// OpenTelemetry integration does not need that channel: it emits GenAI SemConv
// spans through the @opentelemetry/api singleton, and @sentry/bun registers a
// SentryTracerProvider there, so the spans land in Sentry's AI Agents views.
// The Sentry integration is disabled in index.ts so the two can't double up.
const integrations = [new OpenTelemetry()];

// PostHog gets its own tracer, NOT the global provider: registering a second
// global (e.g. an OTel NodeSDK) makes Sentry's registration fail and
// every Sentry span vanish (@sentry/node 10.68.0 build/cjs/sdk/initOtel.js).
// Nor via Sentry's `openTelemetrySpanProcessors`, which would gate PostHog by
// SENTRY_TRACES_SAMPLE_RATE. AlwaysOn so an unsampled Sentry parent can't drop it.
if (env.POSTHOG_PROJECT_TOKEN && env.POSTHOG_HOST) {
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
      new PostHogSpanProcessor({ projectToken: env.POSTHOG_PROJECT_TOKEN, host: env.POSTHOG_HOST }),
    ],
  });
  integrations.push(
    new OpenTelemetry({
      tracer: provider.getTracer("opendiagram-posthog"),
      enrichSpan: ({ runtimeContext }) => ({
        "posthog.distinct_id": runtimeContext?.distinctId as string | undefined,
        $ai_session_id: runtimeContext?.sessionId as string | undefined,
      }),
    }),
  );
}

registerTelemetry(...integrations);

/** Who and which conversation an AI call belongs to, for PostHog AI traces. */
export type AiRuntimeContext = {
  distinctId?: string;
  sessionId: string;
};

/**
 * Per-call telemetry settings for AI SDK calls.
 *
 * Metadata only: model, token counts, latency, and tool names reach Sentry and
 * PostHog; prompts and completions never leave the server. The AI SDK records
 * both by default, so the opt-out has to be explicit on every call.
 */
export function aiTelemetry(functionId: string) {
  return {
    functionId,
    recordInputs: false,
    recordOutputs: false,
    includeRuntimeContext: { distinctId: true, sessionId: true },
  };
}
