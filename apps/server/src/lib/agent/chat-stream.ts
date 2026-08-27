import {
  isStepCount,
  NoSuchToolError,
  streamText,
  toUIMessageStream,
  createUIMessageStream,
  type LanguageModel,
  type ModelMessage,
  type StepResult,
  type ToolSet,
  type UIMessageChunk,
} from "ai";
import type { RequestLogger } from "evlog";
import type { AiQuotaGrant, AiUsage } from "../quota/enforce";
import { LLM_MAX_RETRIES } from "../repo-ai";
import { aiTelemetry } from "../telemetry";
import { drawDiagramInputSchema } from "./tools";

// gemini-2.5-flash reliably mangles edge keys in draw_diagram calls (emits
// "from1" instead of "from" on the first attempt of nearly every session).
// Rename the known-bad keys and revalidate - saves a full model retry
// round-trip. Returns null (= normal tool-error flow) when the input still
// doesn't parse.
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
 * Gemini answering a tool call in its Python calling convention
 * (`print(default_api.draw_diagram(...))`), which its own API then rejects.
 *
 * It is not an HTTP error and not a tool error: the response is a 200 carrying
 * the plan text and no tool call, so `experimental_repairToolCall` never fires
 * and the loop just ends. The user sees a plan and no diagram.
 *
 * Not keyed on empty text - the plan is streamed before the call is attempted,
 * so it is always there. `finishReason` "error" plus the provider's own message
 * is what identifies it.
 *
 * The CANVAS serialization was the root cause (now fixed in `canvas-dsl.ts`).
 * This stays as a tripwire: if it ever fires again the wide event says so, and
 * one retry is cheaper than a turn that drew nothing.
 */
function isMalformedFunctionCall(steps: StepResult<ToolSet>[]): boolean {
  const last = steps[steps.length - 1];
  if (!last || last.finishReason !== "error" || last.toolCalls.length > 0) return false;
  const finishMessage = (last.providerMetadata?.google as { finishMessage?: unknown } | undefined)
    ?.finishMessage;
  return typeof finishMessage === "string" && finishMessage.startsWith("Malformed function call");
}

export type DiagramChatOptions = {
  log: RequestLogger;
  model: LanguageModel;
  messages: ModelMessage[];
  tools: ToolSet;
  grant: AiQuotaGrant;
  meta: { canvasDiagrams: number; theme: string; messageCount: number };
  instructions: string;
};

/**
 * The agent loop for `POST /api/diagram/chat`, as a UI message stream.
 *
 * Runs at most twice, and only for the malformed-call case above. The first
 * attempt is already on the wire by the time that is detected, so whatever text
 * it streamed stays on screen above the retry's. Usage is summed across attempts
 * and the quota grant is settled ONCE - `settle` writes an absolute cost, so a
 * second call would overwrite the first attempt's spend rather than add to it.
 */
export function streamDiagramChat(options: DiagramChatOptions): ReadableStream<UIMessageChunk> {
  const { log, model, messages, tools, grant, meta, instructions } = options;
  // Accumulated per step because `onError` reports no usage. A stream that dies on
  // step four already spent the tokens of the first three, and releasing the whole
  // reservation to zero made that real spend invisible to the cost ceiling.
  const spent: AiUsage = { inputTokens: 0, outputTokens: 0 };
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheRead: 0,
    noCache: 0,
    reasoning: 0,
  };
  const allSteps: StepResult<ToolSet>[] = [];
  let failed = false;
  let malformedCalls = 0;

  const attempt = () =>
    streamText({
      model,
      instructions,
      messages,
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
      onFinish: ({ steps, totalUsage }) => {
        allSteps.push(...steps);
        totals.inputTokens += totalUsage.inputTokens ?? 0;
        totals.outputTokens += totalUsage.outputTokens ?? 0;
        totals.totalTokens += totalUsage.totalTokens ?? 0;
        totals.cacheRead += totalUsage.inputTokenDetails.cacheReadTokens ?? 0;
        totals.noCache += totalUsage.inputTokenDetails.noCacheTokens ?? 0;
        totals.reasoning += totalUsage.outputTokenDetails.reasoningTokens ?? 0;
      },
      onError: ({ error }) => {
        failed = true;
        log.error("diagram chat stream failed", { error });
      },
    });

  return createUIMessageStream({
    execute: async ({ writer }) => {
      for (let run = 0; run < 2; run++) {
        const result = attempt();
        // `tools` makes tool parts stream as static `tool-<name>` parts (the chat
        // panel matches on those) instead of generic `dynamic-tool` parts.
        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            tools,
            // A failing tool passes through THIS handler, never streamText's
            // `onError`. The default here is `() => "An error occurred."`, which
            // is all the chat panel and the logs ever saw.
            onError: (error) => {
              const message = error instanceof Error ? error.message : String(error);
              // Error first, not as a field: evlog unpacks name/message/stack
              // from the first argument only, and a layout throw needs its stack.
              log.error(error instanceof Error ? error : message, {
                chat: { toolError: message },
              });
              // The model gets the real validation error through its own tool
              // result and usually fixes it on the next step, so this string is
              // for the human only. Returning `message` put the whole rejected
              // spec plus a Zod dump in the chat panel.
              return "the spec was rejected, adjusting";
            },
          }),
        );
        const steps = await result.steps;
        if (failed || !isMalformedFunctionCall(steps)) break;
        malformedCalls++;
        log.warn("model returned a malformed function call, retrying once", {
          chat: { malformedCall: true },
        });
      }

      log.set({
        chat: {
          messageCount: meta.messageCount,
          // How many diagrams the canvas held going in, and which one the model
          // chose to replace. A `targetId` that matches nothing in `diagrams` is
          // the signature of the model garbling the id - see the FIXME in
          // `agent/tools.ts` - and shows up here as a duplicate frame.
          canvasDiagrams: meta.canvasDiagrams,
          targetedIds: allSteps.flatMap((s) =>
            s.toolCalls
              .filter((t) => t.toolName === "draw_diagram")
              .map((t) => (t.input as { targetId?: unknown })?.targetId ?? "<new>"),
          ),
          theme: meta.theme,
          steps: allSteps.length,
          toolCalls: allSteps.flatMap((s) => s.toolCalls.map((t) => t.toolName)),
          malformedCalls,
          totalTokens: totals.totalTokens,
          // Output is most of the bill now that the head is cached, so it is
          // split out. Reasoning measured 200-400 of it on gemini-2.5-flash, but
          // `thinkingConfig` is unset and every model picks its own budget, so
          // it is the number to watch when the model changes.
          outputTokens: totals.outputTokens,
          reasoningTokens: totals.reasoning,
          // The system prompt is ~8k tokens, three quarters of it the static icon
          // catalog, and it is re-sent once per step. Whether that is billed at
          // full price or at the cached rate is the single biggest lever on the
          // AI bill, so it gets measured rather than assumed. `cacheReadTokens`
          // near zero means the prefix is being broken - check that nothing was
          // appended after the spec in buildSystemPrompt.
          inputTokens: totals.inputTokens,
          cacheReadTokens: totals.cacheRead,
          noCacheTokens: totals.noCache,
        },
      });

      // Reconciles the pessimistic reservation down to what this run actually
      // cost. Must happen before the response is done on Cloud Run, which
      // throttles CPU once the response completes. A stream that errored gives
      // the credit back but keeps the tokens it burned on the ledger.
      if (failed) await grant.release(spent);
      else
        await grant.settle({ inputTokens: totals.inputTokens, outputTokens: totals.outputTokens });
    },
  });
}
