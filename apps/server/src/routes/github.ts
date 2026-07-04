import { auth } from "@OpenDiagram/auth";
import { db } from "@OpenDiagram/db";
import { project } from "@OpenDiagram/db/schema/project";
import { projectFile } from "@OpenDiagram/db/schema/project-file";
import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { indexRepositoryMemory } from "../lib/project-memory";
import { cloneAndBuildRepositoryDoc } from "../lib/repo-documentation";

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  updated_at: string;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
  };
};

type GitHubImportJob = {
  id: string;
  userId: string;
  repoFullName: string;
  status: "queued" | "cloning" | "documenting" | "indexing" | "done" | "failed";
  message: string;
  error: string | null;
  project: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

const importRequestSchema = z.object({
  repoFullName: z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Repository must use owner/repo format"),
});

export const githubRoute = new Hono();
export const githubImportRoute = new Hono();

const importJobs = new Map<string, GitHubImportJob>();

githubRoute.get("/repositories", async (c) => {
  const token = await getGitHubAccessToken(c.req.raw.headers);

  if (!token) {
    return c.json({ error: "Connect GitHub before importing repositories." }, 401);
  }

  let response: Response;

  try {
    response = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "OpenDiagram",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
  } catch {
    return c.json({ error: "Could not reach GitHub. Check your network connection." }, 502);
  }

  if (!response.ok) {
    return c.json(
      { error: "Could not load GitHub repositories." },
      response.status === 401 ? 401 : 502,
    );
  }

  let repositories: GitHubRepository[];

  try {
    repositories = (await response.json()) as GitHubRepository[];
  } catch {
    return c.json({ error: "Invalid response from GitHub." }, 502);
  }

  return c.json({
    repositories: repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at,
      htmlUrl: repo.html_url,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
      },
    })),
  });
});

githubRoute.post("/import", importGitHubRepository);
githubImportRoute.post("/github", importGitHubRepository);
githubImportRoute.get("/github/:jobId", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Connect GitHub before importing repositories." }, 401);

  const job = importJobs.get(c.req.param("jobId"));
  if (!job || job.userId !== session.user.id)
    return c.json({ error: "Import job not found." }, 404);

  return c.json({ job: toPublicJob(job) });
});

async function importGitHubRepository(c: Context) {
  const authResult = await getGitHubAuth(c.req.raw.headers);

  if (!authResult) {
    return c.json({ error: "Connect GitHub before importing repositories." }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = importRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid repository." }, 400);
  }

  let repoResponse: Response;

  try {
    repoResponse = await fetch(`https://api.github.com/repos/${parsed.data.repoFullName}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${authResult.token}`,
        "User-Agent": "OpenDiagram",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch {
    return c.json({ error: "Could not reach GitHub. Check your network connection." }, 502);
  }

  if (!repoResponse.ok) {
    const status = repoResponse.status;
    if (status === 401 || status === 403 || status === 404) {
      const message =
        status === 401
          ? "GitHub token expired. Reconnect GitHub to continue."
          : status === 403
            ? "Insufficient permissions to access that repository."
            : "GitHub repository not found.";
      return c.json({ error: message }, status);
    }
    return c.json({ error: "Could not access that GitHub repository." }, 502);
  }

  let repo: GitHubRepository;

  try {
    repo = (await repoResponse.json()) as GitHubRepository;
  } catch {
    return c.json({ error: "Invalid response from GitHub." }, 502);
  }

  const job = createImportJob({ repoFullName: repo.full_name, userId: authResult.userId });
  void runImportJob({ jobId: job.id, repo, token: authResult.token });

  return c.json({ job: toPublicJob(job) }, 202);
}

async function getGitHubAccessToken(headers: Headers) {
  const authResult = await getGitHubAuth(headers);
  return authResult?.token ?? null;
}

async function getGitHubAuth(headers: Headers) {
  const session = await auth.api.getSession({ headers });

  if (!session) {
    return null;
  }

  try {
    const token = await auth.api.getAccessToken({
      headers,
      body: {
        providerId: "github",
        userId: session.user.id,
      },
    });

    return { token: token.accessToken, userId: session.user.id };
  } catch {
    return null;
  }
}

function createImportJob(input: { repoFullName: string; userId: string }): GitHubImportJob {
  const now = new Date().toISOString();
  const job: GitHubImportJob = {
    id: crypto.randomUUID(),
    userId: input.userId,
    repoFullName: input.repoFullName,
    status: "queued",
    message: "Queued repository import",
    error: null,
    project: null,
    createdAt: now,
    updatedAt: now,
  };
  importJobs.set(job.id, job);
  return job;
}

async function runImportJob(input: { jobId: string; repo: GitHubRepository; token: string }) {
  const job = importJobs.get(input.jobId);
  if (!job) return;

  try {
    const importedAt = new Date().toISOString();
    updateImportJob(job.id, { status: "cloning", message: "Cloning repository to server" });
    const documentation = await cloneAndBuildRepositoryDoc({
      repoFullName: input.repo.full_name,
      defaultBranch: input.repo.default_branch,
      token: input.token,
      importedAt,
    });

    updateImportJob(job.id, { status: "documenting", message: "Creating documentation file" });
    const [projectRow] = await db
      .insert(project)
      .values({
        userId: job.userId,
        name: input.repo.full_name,
        description: `Imported from GitHub (${input.repo.default_branch})`,
        source: "github_import",
        sourceMetadata: {
          repoFullName: input.repo.full_name,
          defaultBranch: input.repo.default_branch,
          htmlUrl: input.repo.html_url,
          importedAt,
          repoPath: documentation.repoPath,
          commitSha: documentation.commitSha,
        },
      })
      .returning();

    if (!projectRow) throw new Error("Could not create imported project.");

    await db.insert(projectFile).values({
      projectId: projectRow.id,
      name: "Repository overview.md",
      type: "doc",
      content: documentation.markdown,
      spec: documentation.provenance,
    });

    updateImportJob(job.id, { status: "indexing", message: "Indexing repository memory" });
    const memoryResult = await indexRepositoryMemory({
      projectId: projectRow.id,
      userId: job.userId,
      repoFullName: input.repo.full_name,
      branch: input.repo.default_branch,
      commitSha: documentation.commitSha,
      repoPath: documentation.repoPath,
      sourceDocuments: documentation.sourceDocuments,
    }).catch((error) => ({
      status: "failed",
      error: error instanceof Error ? error.message : "Repository memory indexing failed.",
    }));

    updateImportJob(job.id, {
      status: "done",
      message:
        memoryResult?.status === "ready"
          ? "Repository imported and indexed"
          : "Repository imported; memory indexing unavailable",
      project: { id: projectRow.id, name: projectRow.name },
    });
  } catch (error) {
    updateImportJob(job.id, {
      status: "failed",
      message: "Repository import failed",
      error: error instanceof Error ? error.message : "Repository import failed.",
    });
  }
}

function updateImportJob(
  jobId: string,
  values: Partial<Pick<GitHubImportJob, "status" | "message" | "error" | "project">>,
) {
  const job = importJobs.get(jobId);
  if (!job) return;

  importJobs.set(jobId, { ...job, ...values, updatedAt: new Date().toISOString() });
}

function toPublicJob(job: GitHubImportJob) {
  const { userId: _userId, ...publicJob } = job;
  return publicJob;
}
