import { createGoogle } from "@ai-sdk/google";
import { env } from "@OpenDiagram/env/server";
import { diagramSpecSchema, themes } from "@OpenDiagram/harness";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { z } from "zod";
import { buildSystemPrompt } from "../lib/agent/prompt";
import { askUserTool, createDrawDiagramTool } from "../lib/agent/tools";
import { LLM_MAX_RETRIES } from "../lib/repo-ai";

const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });

const chatRequestSchema = z.object({
  // UIMessage shape is owned by the AI SDK and too deep to mirror — validated
  // structurally by convertToModelMessages below.
  messages: z.array(z.looseObject({})).min(1).max(50),
  currentSpec: diagramSpecSchema.optional(),
  theme: z.enum(["classic", "sketch"]).optional(),
});

export const diagramRoute = new Hono<EvlogVariables>();

diagramRoute.post("/chat", async (c) => {
  const log = c.get("log");
  const body = await c.req.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }
  const { messages, currentSpec, theme: themeName = "sketch" } = parsed.data;

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

  const tools = {
    ask_user: askUserTool,
    draw_diagram: createDrawDiagramTool(log, themes[themeName]),
  };

  const result = streamText({
    model: google("gemini-2.5-flash"),
    instructions: buildSystemPrompt(currentSpec),
    messages: modelMessages,
    tools,
    stopWhen: isStepCount(6),
    // Retry Gemini on rate-limit/transient errors (exponential backoff).
    maxRetries: LLM_MAX_RETRIES,
    // Bounds runaway/repetition-loop generations so a bad completion fails
    // fast instead of hanging (observed with gemini-2.5-flash during testing).
    maxOutputTokens: 16384,
    onFinish: ({ steps, totalUsage }) => {
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
    },
  });

  return createUIMessageStreamResponse({
    // `tools` makes tool parts stream as static `tool-<name>` parts (the chat
    // panel matches on those) instead of generic `dynamic-tool` parts.
    stream: toUIMessageStream({ stream: result.stream, tools }),
  });
});
