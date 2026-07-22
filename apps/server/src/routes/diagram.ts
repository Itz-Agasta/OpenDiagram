/** Streams interactive diagram-agent responses and applies provider quota/fallback policy. */
import { auth } from "@OpenDiagram/auth";
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
import {
  aiProviderErrorResponse,
  aiProviderLogFields,
  isProviderCreditError,
  applyAiProviderHeaders,
  isProviderCapacityError,
  isProviderRateLimitErrorForSource,
  providerCapacityMessage,
  providerCreditResponse,
  resolveModel,
} from "../lib/ai-provider";
import {
  applyCreationQuotaHeaders,
  consumeCreationQuota,
  creationQuotaExceededResponse,
  CreationQuotaExceededError,
  getCreationQuotaActor,
} from "../lib/creation-quota";
import { LLM_MAX_RETRIES } from "../lib/repo-ai";

const chatRequestSchema = z.object({
  // UIMessage shape is owned by the AI SDK and too deep to mirror — validated
  // structurally by convertToModelMessages below.
  messages: z.array(z.looseObject({})).min(1).max(50),
  modelId: z.string().trim().min(1).max(120).optional(),
  providerId: z.string().uuid().optional(),
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

export const diagramRoute = new Hono<EvlogVariables>();

diagramRoute.post("/chat", async (c) => {
  const log = c.get("log");
  const body = await c.req.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }
  const { messages, modelId, providerId, currentSpec, theme: themeName = "sketch" } = parsed.data;

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

  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  const userId = session?.user.id ?? null;
  let resolved: Awaited<ReturnType<typeof resolveModel>>;

  try {
    resolved = await resolveModel({ userId, providerId, modelId, capability: "tools" });
  } catch (error) {
    log.error("diagram chat model resolution failed", { error });
    const mapped = aiProviderErrorResponse(error);
    if (mapped) return c.json(mapped.body, mapped.status);
    throw error;
  }

  applyAiProviderHeaders(c, resolved);

  if (resolved.countsAgainstPlatformQuota) {
    try {
      const quota = await consumeCreationQuota(
        await getCreationQuotaActor(c, userId ? { userId } : {}),
      );
      applyCreationQuotaHeaders(c, quota);
    } catch (error) {
      if (error instanceof CreationQuotaExceededError) {
        return creationQuotaExceededResponse(c, error);
      }
      throw error;
    }
  }

  const tools = {
    ask_user: askUserTool,
    draw_diagram: createDrawDiagramTool(log, themes[themeName]),
  };

  const result = streamText({
    model: resolved.model,
    instructions: buildSystemPrompt(currentSpec),
    messages: modelMessages,
    tools,
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
    // Retry transient errors from the selected streaming provider.
    maxRetries: LLM_MAX_RETRIES,
    // Bounds runaway/repetition-loop generations so a bad completion fails
    // fast instead of hanging (observed with gemini-2.5-flash during testing).
    maxOutputTokens: 16384,
    onFinish: ({ steps, totalUsage }) => {
      log.set({
        ...aiProviderLogFields(resolved, { purpose: "diagram_chat", phase: "finish" }),
        chat: {
          messageCount: messages.length,
          hasCurrentSpec: currentSpec !== undefined,
          theme: themeName,
          steps: steps.length,
          toolCalls: steps.flatMap((s) => s.toolCalls.map((t) => t.toolName)),
          totalTokens: totalUsage.totalTokens,
        },
      });
    },
  });

  return createUIMessageStreamResponse({
    // `tools` makes tool parts stream as static `tool-<name>` parts (the chat
    // panel matches on those) instead of generic `dynamic-tool` parts.
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      onError: (error) => {
        log.error("diagram chat stream failed", {
          error,
          ...aiProviderLogFields(resolved, { purpose: "diagram_chat", phase: "stream_error" }),
        });
        if (resolved.source === "byok" && isProviderCreditError(error)) {
          return providerCreditResponse().error;
        }
        return isProviderCapacityError(error, resolved.source)
          ? providerCapacityMessage()
          : isProviderRateLimitErrorForSource(error, resolved.source)
            ? "Your selected AI provider is rate limited. Try again shortly."
            : "The diagram agent is unavailable. Try again.";
      },
    }),
  });
});
