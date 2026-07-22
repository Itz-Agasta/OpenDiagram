import { generateText } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { createOrchestratorModel } from "../lib/ai-provider";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

const DIAGRAM_NOUNS =
  /\b(diagram|flowchart|sequence diagram|architecture diagram|system flow|request flow|data flow|canvas|whiteboard)\b/i;
const DIAGRAM_VERBS = /\b(create|design|draw|generate|render|sketch|map)\b/i;
const DIAGRAM_TARGETS =
  /\b(diagram|architecture|system flow|request flow|data flow|sequence|flowchart)\b/i;
const ARCHITECTURE_INTENT =
  /\b(how should|what would|help me|can you|design|architect|build|create|model|visuali[sz]e|draw|generate|map)\b[\s\S]{0,100}\b(architecture|system|topology|component|service|api|database|auth|authentication|payment|checkout|event|queue|microservice|infrastructure|flow)\b/i;

const SYSTEM_PROMPT = `You are an orchestrator for an AI architecture workspace. Classify the user's request into one of two intents:

- "diagram" — user wants to create, design, or modify a visual diagram on a canvas
- "project_chat" — user is asking a question, discussing concepts, or wants information

Reply with exactly one word: "diagram" or "project_chat". No punctuation, no explanation.`;

export const orchestrateRoute = new Hono();

orchestrateRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const { text } = parsed.data;

  if (isLikelyDiagramRequest(text)) {
    return c.json({ intent: "diagram" });
  }

  try {
    const { text: response } = await generateText({
      model: createOrchestratorModel(),
      system: SYSTEM_PROMPT,
      prompt: text,
      timeout: 15_000,
    });

    const intent = response.trim().toLowerCase() === "diagram" ? "diagram" : "project_chat";
    return c.json({ intent });
  } catch {
    return c.json({ intent: "diagram" });
  }
});

function isLikelyDiagramRequest(text: string) {
  return (
    DIAGRAM_NOUNS.test(text) ||
    (DIAGRAM_VERBS.test(text) && DIAGRAM_TARGETS.test(text)) ||
    ARCHITECTURE_INTENT.test(text)
  );
}
