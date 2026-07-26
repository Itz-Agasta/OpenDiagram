import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { env } from "@OpenDiagram/env/server";
import { enforceAiBurst, quotaErrorResponse } from "../lib/quota";
import { type AuthVariables, requireAuth } from "../lib/require-auth";
import { aiTelemetry } from "../lib/telemetry";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

const DIAGRAM_NOUNS =
  /\b(diagram|flowchart|sequence diagram|architecture diagram|system flow|request flow|data flow|canvas|whiteboard)\b/i;
const DIAGRAM_VERBS = /\b(create|design|draw|generate|render|sketch|map)\b/i;
const DIAGRAM_TARGETS =
  /\b(diagram|architecture|system flow|request flow|data flow|sequence|flowchart)\b/i;

const SYSTEM_PROMPT = `You are an orchestrator for an AI architecture workspace. Classify the user's request into one of two intents:

- "diagram" — user wants to create, design, or modify a visual diagram on a canvas
- "project_chat" — user is asking a question, discussing concepts, or wants information

Reply with exactly one word: "diagram" or "project_chat". No punctuation, no explanation.`;

export const orchestrateRoute = new Hono<{ Variables: AuthVariables }>();

// This endpoint spends a platform key, so it cannot be anonymous. It used to be:
// no auth, no metering, 2000 chars straight to Groq, and the regex below fails
// open in the unhelpful direction (matching text skips the model, so junk that
// matches nothing hits the model every time) -- an unauthenticated caller could
// drain the key in a loop. CORS does not help; it is browser-enforced only.
//
// Signed-out users lose model-based routing and fall back to the regex, which is
// already what happens when GROQ_API_KEY is unset: the web client catches the
// failure and uses `diagramRequestLikely()`. So this costs guests routing
// accuracy, not function.
orchestrateRoute.use("*", requireAuth);

orchestrateRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const { text } = parsed.data;

  // Cheap paths first: the regex and the unconfigured-key case reach no model, so
  // neither should spend a rate-limit token.
  if (isLikelyDiagramRequest(text)) {
    return c.json({ intent: "diagram" });
  }

  if (!env.GROQ_API_KEY) {
    return c.json({ intent: "project_chat" });
  }

  try {
    await enforceAiBurst(c, "orchestrate", c.get("userId"));
  } catch (error) {
    const response = quotaErrorResponse(c, error);
    if (response) return response;
    throw error;
  }

  try {
    const { text: response } = await generateText({
      model: groq("groq/compound-mini"),
      system: SYSTEM_PROMPT,
      prompt: text,
      telemetry: aiTelemetry("orchestrate-intent"),
      timeout: 15_000,
    });

    const intent = response.trim().toLowerCase() === "diagram" ? "diagram" : "project_chat";
    return c.json({ intent });
  } catch {
    return c.json({ intent: "project_chat" });
  }
});

function isLikelyDiagramRequest(text: string) {
  return DIAGRAM_NOUNS.test(text) || (DIAGRAM_VERBS.test(text) && DIAGRAM_TARGETS.test(text));
}
