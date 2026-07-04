import "dotenv/config";
import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { env } from "@OpenDiagram/env/server";

const requestSchema = z.object({
  text: z.string().min(1).max(2000),
});

const DIAGRAM_KEYWORDS =
  /\b(create|design|draw|generate|make|build|render|diagram|flow|architecture|system flow|canvas)\b/i;

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

  if (DIAGRAM_KEYWORDS.test(text)) {
    return c.json({ intent: "diagram" });
  }

  if (!env.GROQ_API_KEY) {
    return c.json({ intent: "project_chat" });
  }

  try {
    const { text: response } = await generateText({
      model: groq("groq/compound-mini"),
      system: SYSTEM_PROMPT,
      prompt: text,
    });

    const intent = response.trim().toLowerCase() === "diagram" ? "diagram" : "project_chat";
    return c.json({ intent });
  } catch {
    return c.json({ intent: "project_chat" });
  }
});
