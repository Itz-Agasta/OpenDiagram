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
import { buildCanvasContext, buildSystemPrompt } from "../lib/agent/prompt";
import { askUserTool, createDrawDiagramTool, drawDiagramInputSchema } from "../lib/agent/tools";
import { enforceAiQuota, quotaErrorResponse } from "../lib/quota";
import { getRequestSession } from "../lib/session";
import { ModelSelectionError, resolveModel } from "../lib/ai-provider/resolve";
import { LLM_MAX_RETRIES } from "../lib/repo-ai";
import { aiTelemetry } from "../lib/telemetry";

/** Capped to match `MAX_PROMPT_DIAGRAMS` on the client. */
const MAX_PROMPT_DIAGRAMS = 8;

const chatRequestSchema = z.object({
  // UIMessage shape is owned by the AI SDK and too deep to mirror — validated
  // structurally by convertToModelMessages below.
  messages: z.array(z.looseObject({})).min(1).max(50),
  // Every diagram on the canvas, not just the one drawn last. `id` is the client's
  // Excalidraw frame id, which is what `draw_diagram`'s `targetId` names.
  diagrams: z
    .array(z.object({ id: z.string().min(1).max(200), spec: diagramSpecSchema }))
    .max(MAX_PROMPT_DIAGRAMS)
    .optional(),
  theme: z.enum(["classic", "sketch"]).optional(),
  // Overrides the caller's saved default for this request only. Validated in
  // `resolveModel` against their own rows, not here.
  providerId: z.string().min(1).max(64).optional(),
  modelId: z.string().min(1).max(120).optional(),
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
    // The TOOL's schema, not the bare spec schema: the SDK re-validates whatever
    // this returns against it, so checking `diagramSpecSchema` here waved through
    // a bad `targetId` and burned a step on a repair that failed anyway.
    return drawDiagramInputSchema.safeParse(input).success ? JSON.stringify(input) : null;
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
  const { messages, providerId, modelId, diagrams = [], theme: themeName = "sketch" } = parsed.data;

  const tools = {
    ask_user: askUserTool,
    draw_diagram: createDrawDiagramTool(log, themes[themeName]),
  };

  // convertToModelMessages throws on malformed UIMessage shapes -- that's a bad
  // client payload, not a server fault, so surface it as a 400.
  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    // `tools` is not optional decoration. Without it the conversion cannot find
    // `draw_diagram`'s `toModelOutput`, so every past draw's tool result enters
    // the context as its RAW output -- the full Excalidraw `skeletons` and
    // `rawElements`, ~184 elements per diagram. Measured on a two-diagram canvas:
    // 279,666 input tokens for one turn, against ~10k of actual prompt. The next
    // turn then stalled for 122s and produced nothing.
    //
    // With `tools` passed, history collapses to the compact summary the tool
    // already declares, which is all the model ever needed to read back.
    modelMessages = await convertToModelMessages(messages as unknown as UIMessage[], { tools });
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
    resolved = await resolveModel(userId, { providerId, modelId });
  } catch (error) {
    if (error instanceof ModelSelectionError) {
      return c.json({ error: error.message, code: "model_unavailable" }, 400);
    }
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

  // Accumulated per step because `onError` reports no usage. A stream that dies on
  // step four already spent the tokens of the first three, and releasing the whole
  // reservation to zero made that real spend invisible to the cost ceiling.
  const spent = { inputTokens: 0, outputTokens: 0 };

  const result = streamText({
    model: resolved.model,
    instructions: buildSystemPrompt(),
    // First, not last: the model reads the canvas before the request referring to
    // it, the order it had while this lived in the system prompt. Why it moved out
    // of the prompt at all is on `buildSystemPrompt`.
    messages: [{ role: "user" as const, content: buildCanvasContext(diagrams) }, ...modelMessages],
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
          // How many diagrams the canvas held going in, and which one the model
          // chose to replace. A `targetId` that matches nothing in `diagrams` is
          // the signature of the model garbling the id -- see the FIXME in
          // `agent/tools.ts` -- and shows up here as a duplicate frame.
          canvasDiagrams: diagrams.length,
          targetedIds: steps.flatMap((s) =>
            s.toolCalls
              .filter((t) => t.toolName === "draw_diagram")
              .map((t) => (t.input as { targetId?: unknown })?.targetId ?? "<new>"),
          ),
          theme: themeName,
          steps: steps.length,
          toolCalls: steps.flatMap((s) => s.toolCalls.map((t) => t.toolName)),
          totalTokens: totalUsage.totalTokens,
          // The system prompt is ~8k tokens, three quarters of it the static icon
          // catalog, and it is re-sent once per step. Whether that is billed at
          // full price or at the cached rate is the single biggest lever on the
          // AI bill, so it gets measured rather than assumed. `cachedInputTokens`
          // near zero means the prefix is being broken -- check that nothing was
          // appended after the spec in buildSystemPrompt.
          inputTokens: totalUsage.inputTokens,
          cacheReadTokens: totalUsage.inputTokenDetails.cacheReadTokens ?? 0,
          noCacheTokens: totalUsage.inputTokenDetails.noCacheTokens ?? 0,
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
