import { auth } from "@OpenDiagram/auth";
import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";

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

const importRequestSchema = z.object({
  repoFullName: z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Repository must use owner/repo format"),
});

export const githubRoute = new Hono();
export const githubImportRoute = new Hono();

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

async function importGitHubRepository(c: Context) {
  const token = await getGitHubAccessToken(c.req.raw.headers);

  if (!token) {
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
        Authorization: `Bearer ${token}`,
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

  return c.json({
    project: {
      id: String(repo.id),
      name: repo.name,
      repoFullName: repo.full_name,
      defaultBranch: repo.default_branch,
      importedAt: new Date().toISOString(),
    },
  });
}

async function getGitHubAccessToken(headers: Headers) {
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

    return token.accessToken;
  } catch {
    return null;
  }
}
