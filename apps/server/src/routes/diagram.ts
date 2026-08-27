import { diagramSpecSchema, themes } from "@OpenDiagram/harness";
import { convertToModelMessages, createUIMessageStreamResponse, type UIMessage } from "ai";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { z } from "zod";
import { streamDiagramChat } from "../lib/agent/chat-stream";
import { buildCanvasContext, buildSystemPrompt } from "../lib/agent/prompt";
import { askUserTool, createDrawDiagramTool } from "../lib/agent/tools";
import { enforceAiQuota, quotaErrorResponse } from "../lib/quota";
import { getRequestSession } from "../lib/session";
import { ModelSelectionError, resolveModel } from "../lib/ai-provider/resolve";

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
    draw_diagram: createDrawDiagramTool(log, themes[themeName], diagrams),
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

  return createUIMessageStreamResponse({
    stream: streamDiagramChat({
      log,
      model: resolved.model,
      instructions: buildSystemPrompt(),
      // Canvas first, not last: the model reads the canvas before the request
      // referring to it, the order it had while this lived in the system prompt.
      // Why it moved out of the prompt at all is on `buildSystemPrompt`.
      messages: [
        { role: "user" as const, content: buildCanvasContext(diagrams) },
        ...modelMessages,
      ],
      tools,
      grant,
      meta: {
        canvasDiagrams: diagrams.length,
        theme: themeName,
        messageCount: messages.length,
      },
    }),
  });
});
