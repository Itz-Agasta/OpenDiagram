import { and, db, eq } from "@OpenDiagram/db";
import { project } from "@OpenDiagram/db/schema/projects";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { takeAiGrant } from "../../lib/ai-grant";
import {
  getRepoGenerationJob,
  runRepoGenerationWithEmitter,
  startRepoGeneration,
  type RepoGenerationJob,
} from "../../lib/repo-generation";
import type { AuthVariables } from "../../lib/require-auth";

export const repoGenerationRoute = new Hono<{ Variables: AuthVariables }>();

// FIXME: HAVE TO IMPOVE THIS WHOLE GITHUB PART PART
repoGenerationRoute.post("/:projectId/repo-generation", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const [projectRow] = await db
    .select({ source: project.source, generationStatus: project.generationStatus })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)));

  if (!projectRow) return c.json({ error: "Not found" }, 404);
  if (projectRow.source !== "github_import") {
    return c.json({ error: "Repository generation is only available for GitHub imports." }, 400);
  }

  // A fresh or previously failed run costs a credit; resuming one that is
  // already in flight was paid for on its first attempt.
  const isFreshRun =
    projectRow.generationStatus === "none" || projectRow.generationStatus === "failed";
  const grant = await takeAiGrant(c, userId, "repo-generate", { meter: isFreshRun });
  if (grant instanceof Response) return grant;

  let started: Awaited<ReturnType<typeof startRepoGeneration>>;
  try {
    started = await startRepoGeneration({ projectId, userId, ai: grant.ai });
  } catch (error) {
    await grant.release();
    return c.json(
      { error: error instanceof Error ? error.message : "Could not start repository generation." },
      400,
    );
  }
  if (!started) {
    await grant.release();
    return c.json({ error: "Not found" }, 404);
  }
  const startedResult = started;

  // Stream generation progress inside the request so the work keeps its CPU
  // allocation on Cloud Run scale-to-zero (see routes/github.ts import stream).
  return streamSSE(c, async (stream) => {
    const send = (job: RepoGenerationJob) =>
      stream.writeSSE({ event: "status", data: JSON.stringify(job) });
    try {
      // Inside the try, not before it: a client that disconnects between the grant
      // and the first write makes this throw, and outside the try that leaked the
      // reservation and left the queued job unrun.
      await send(startedResult.job);
      // Swallow write errors on a closed stream (client disconnect) so a rejected
      // writeSSE promise can't become an unhandled rejection.
      await runRepoGenerationWithEmitter(startedResult, (job) => {
        send(job).catch(() => {});
      });
    } catch (error) {
      await grant.release();
      throw error;
    }
    // Still inside the streaming response, which is what keeps CPU allocated on
    // Cloud Run long enough for the ledger write to land.
    await grant.settle();
  });
});

repoGenerationRoute.get("/:projectId/repo-generation/:jobId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const jobId = c.req.param("jobId");
  const job = await getRepoGenerationJob({ projectId, userId, jobId });

  if (!job) return c.json({ error: "Repository generation job not found." }, 404);

  return c.json({ job });
});
