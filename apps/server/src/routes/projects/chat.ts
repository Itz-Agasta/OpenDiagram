import { Hono } from "hono";
import { z } from "zod";
import { takeAiGrant } from "../../lib/ai-grant";
import { getProjectContext } from "../../lib/project-context";
import { generateGroundedProjectAnswer } from "../../lib/repo-ai";
import type { AuthVariables } from "../../lib/require-auth";

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
});

export const chatRoute = new Hono<{ Variables: AuthVariables }>();

chatRoute.post("/:projectId/chat", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  // Ahead of the grant, so a question about a project that isn't there never
  // takes a credit.
  const projectContext = await getProjectContext(projectId, userId);

  if (!projectContext) {
    return c.json({ error: "Not found" }, 404);
  }

  const grant = await takeAiGrant(c, userId, "project-chat");
  if (grant instanceof Response) return grant;

  let answer: string;
  try {
    answer = await generateGroundedProjectAnswer(
      {
        message: parsed.data.message,
        context: projectContext.context,
      },
      grant.ai,
    );
  } catch (error) {
    // Nothing billable came back, so hand the credit and the reservation back
    // rather than charging for a model outage.
    await grant.release();
    throw error;
  }
  await grant.settle();

  return c.json({
    answer,
    sources: projectContext.sources,
    provider: projectContext.provider,
  });
});
