import { diagramSpecSchema, themes } from "@OpenDiagram/harness";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  NoSuchToolError,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { z } from "zod";
import { buildSystemPrompt } from "../lib/agent/prompt";
import { askUserTool, createDrawDiagramTool } from "../lib/agent/tools";
import { enforceAiQuota, quotaErrorResponse } from "../lib/quota";
import { getRequestSession } from "../lib/session";
import { resolveModel } from "../lib/ai-provider/resolve";
import { LLM_MAX_RETRIES } from "../lib/repo-ai";
import { aiTelemetry } from "../lib/telemetry";

const chatRequestSchema = z.object({
  // UIMessage shape is owned by the AI SDK and too deep to mirror — validated
  // structurally by convertToModelMessages below.
  messages: z.array(z.looseObject({})).min(1).max(50),
  modelId: z.string().optional(),
  provider: z.enum(["openai", "anthropic", "google", "openrouter"]).optional(),
  currentSpec: diagramSpecSchema.optional(),
  theme: z.enum(["classic", "sketch"]).optional(),
});

// gemini-2.5-flash reliably mangles edge keys in draw_diagram calls (emits
// "from1" instead of "from" on the first attempt of nearly every session).
// Deterministic repair: rename the known-bad keys and revalidate — saves a
// full model retry round-trip. Returns null (= normal tool-error flow) when
// the input still doesn't parse.
const EDGE_KEY_FIXUPS: [string, string][] = [
  ["from1", "from"],
  ["to1", "to"],
  ["source", "from"],
  ["target", "to"],
];

function repairDrawDiagramInput(rawInput: unknown): string | null {
  try {
    const input: unknown = typeof rawInput === "string" ? JSON.parse(rawInput) : rawInput;
    const edges = (input as { edges?: unknown })?.edges;
    if (!Array.isArray(edges)) return null;
    for (const edge of edges as Record<string, unknown>[]) {
      if (!edge || typeof edge !== "object") continue;
      for (const [bad, good] of EDGE_KEY_FIXUPS) {
        if (edge[bad] !== undefined && edge[good] === undefined) {
          edge[good] = edge[bad];
          delete edge[bad];
        }
      }
    }
    return diagramSpecSchema.safeParse(input).success ? JSON.stringify(input) : null;
  } catch {
    return null;
  }
}

/**
 * Identifies the conversation turn a request belongs to, so one user message costs
 * one credit however many round trips the agent loop takes.
 *
 * It's the id of the trailing user message. That is stable across the automatic
 * resubmission `ask_user` triggers -- the client appends assistant and tool
 * messages but never rewrites the user one -- and changes exactly when the user
 * says something new. Deriving it here rather than accepting a client field means
 * no new untrusted input and no client change.
 *
 * The id itself is still client-generated, so a caller could replay one to keep
 * spending on a single credit. Two things bound that: `MAX_REQUESTS_PER_TURN` in
 * cost-ceiling.ts, and the cost ceiling, which meters every request regardless.
 */
function turnIdFor(messages: { role?: unknown; id?: unknown }[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    return typeof message.id === "string" && message.id.length > 0 ? message.id : undefined;
  }
  return undefined;
}

export const diagramRoute = new Hono<EvlogVariables>();

diagramRoute.post("/chat", async (c) => {
  const log = c.get("log");
  const body = await c.req.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }
  const { messages, modelId, provider, currentSpec, theme: themeName = "sketch" } = parsed.data;

  // convertToModelMessages throws on malformed UIMessage shapes -- that's a bad
  // client payload, not a server fault, so surface it as a 400.
  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    modelMessages = await convertToModelMessages(messages as unknown as UIMessage[]);
  } catch (err) {
    return c.json(
      { error: "Invalid messages", detail: err instanceof Error ? err.message : String(err) },
      400,
    );
  }

  // BYOK: signed-in users with a configured provider run on their own key/model
  // (and skip the platform quota). Everyone else runs on the platform model.
  const session = await getRequestSession(c);
  const userId = session?.user.id;
  let resolved: Awaited<ReturnType<typeof resolveModel>>;
  try {
    resolved = await resolveModel(userId, modelId, provider);
  } catch (error) {
    log.error("Failed to resolve BYOK model", { error });
    return c.json({ error: "Your saved AI provider key could not be used. Check Settings." }, 502);
  }
  if (!resolved) {
    return c.json({ error: "No AI provider is configured." }, 503);
  }
  log.set({
    ai: { source: resolved.source, provider: resolved.provider, modelId: resolved.modelId },
  });

  let grant: Awaited<ReturnType<typeof enforceAiQuota>>;
  try {
    grant = await enforceAiQuota(c, resolved, "diagram-chat", userId, turnIdFor(messages));
  } catch (error) {
    const response = quotaErrorResponse(c, error);
    if (response) return response;
    throw error;
  }

  const tools = {
    ask_user: askUserTool,
    draw_diagram: createDrawDiagramTool(log, themes[themeName]),
  };

  // Accumulated per step because `onError` reports no usage. A stream that dies on
  // step four already spent the tokens of the first three, and releasing the whole
  // reservation to zero made that real spend invisible to the cost ceiling.
  const spent = { inputTokens: 0, outputTokens: 0 };

  const result = streamText({
    model: resolved.model,
    instructions: buildSystemPrompt(currentSpec),
    messages: modelMessages,
    tools,
    telemetry: aiTelemetry("diagram-chat"),
    stopWhen: isStepCount(6),
    experimental_repairToolCall: async ({ toolCall, error }) => {
      if (NoSuchToolError.isInstance(error) || toolCall.toolName !== "draw_diagram") return null;
      const repaired = repairDrawDiagramInput(toolCall.input);
      if (!repaired) return null;
      log.warn("repaired malformed draw_diagram tool call (edge key fixups)", {
        diagram: { repairedToolCall: true },
      });
      return { ...toolCall, input: repaired };
    },
    // Retry Gemini on rate-limit/transient errors (exponential backoff).
    maxRetries: LLM_MAX_RETRIES,
    // Bounds runaway/repetition-loop generations so a bad completion fails
    // fast instead of hanging (observed with gemini-2.5-flash during testing).
    maxOutputTokens: 16384,
    onStepEnd: ({ usage }) => {
      spent.inputTokens += usage.inputTokens ?? 0;
      spent.outputTokens += usage.outputTokens ?? 0;
    },
    onFinish: async ({ steps, totalUsage }) => {
      log.set({
        chat: {
          messageCount: messages.length,
          hasCurrentSpec: currentSpec !== undefined,
          theme: themeName,
          steps: steps.length,
          toolCalls: steps.flatMap((s) => s.toolCalls.map((t) => t.toolName)),
          totalTokens: totalUsage.totalTokens,
        },
      });
      // Reconciles the pessimistic reservation down to what this run actually
      // cost. Must happen before the response is done on Cloud Run, which
      // throttles CPU once the response completes.
      await grant.settle({
        inputTokens: totalUsage.inputTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
      });
    },
    onError: async ({ error }) => {
      log.error("diagram chat stream failed", { error });
      // The user got no diagram, so the credit goes back -- but whatever steps did
      // complete cost us real tokens and stay on the ledger. A model outage before
      // the first step reports nothing and releases to zero as before.
      await grant.release(spent);
    },
  });

  return createUIMessageStreamResponse({
    // `tools` makes tool parts stream as static `tool-<name>` parts (the chat
    // panel matches on those) instead of generic `dynamic-tool` parts.
    stream: toUIMessageStream({ stream: result.stream, tools }),
  });
});
