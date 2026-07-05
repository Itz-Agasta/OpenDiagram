"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GithubLogoIcon } from "@phosphor-icons/react";
import { ArrowLeft, Check, GitBranch, Loader2, Lock, Search } from "lucide-react";
import { ButtonShaderTexture } from "@/components/button-shader-texture";
import { authClient } from "@/lib/auth-client";
import {
  importGitHubRepositoryStream,
  listGitHubRepositories,
  type ImportedGitHubProject,
  type GitHubRepository,
} from "@/lib/github-import-client";

type LoadState = "idle" | "loading" | "ready" | "error";
type ImportState = "idle" | "importing" | "done";

const progressSteps = [
  "Reading repository structure",
  "Detecting services and dependencies",
  "Preparing architecture workspace",
];

export default function GitHubImportPage() {
  return (
    <Suspense fallback={<ImportPageShell />}>
      <GitHubImportContent />
    </Suspense>
  );
}

function GitHubImportContent() {
  const searchParams = useSearchParams();
  const session = authClient.useSession();
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [importState, setImportState] = useState<ImportState>("idle");
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [importedProject, setImportedProject] = useState<ImportedGitHubProject | null>(null);
  const [importMessage, setImportMessage] = useState("Queued repository import");
  const [error, setError] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const importAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const requestedRepo = useMemo(() => {
    const fromQuery = normalizeRepoTarget(searchParams.get("repo") ?? "");

    if (fromQuery) return fromQuery;
    if (typeof window === "undefined") return "";

    return window.localStorage.getItem("opendiagram:pending-github-repo") ?? "";
  }, [searchParams]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      importAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!requestedRepo) return;

    setQuery(requestedRepo);
    setSelectedRepo(requestedRepo);
  }, [requestedRepo]);

  useEffect(() => {
    if (session.isPending || !session.data) return;

    let active = true;

    async function loadRepositories() {
      setLoadState("loading");
      setError(null);

      try {
        const repos = await listGitHubRepositories();
        if (!active) return;

        setRepositories(repos);
        setLoadState("ready");

        if (
          requestedRepo &&
          repos.some((repo) => repo.fullName.toLowerCase() === requestedRepo.toLowerCase())
        ) {
          setSelectedRepo(requestedRepo);
        }
      } catch (err) {
        if (!active) return;

        setError(err instanceof Error ? err.message : "Could not load GitHub repositories.");
        setLoadState("error");
      }
    }

    void loadRepositories();

    return () => {
      active = false;
    };
  }, [requestedRepo, session.data, session.isPending]);

  async function connectGitHub() {
    setAuthPending(true);
    setError(null);
    const callbackPath = `/import/github${
      requestedRepo ? `?repo=${encodeURIComponent(requestedRepo)}` : ""
    }`;

    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: new URL(callbackPath, window.location.origin).toString(),
      });
    } catch {
      setError("Could not start GitHub sign in.");
      setAuthPending(false);
    }
  }

  const [importingRepo, setImportingRepo] = useState<string | null>(null);

  async function importSelectedRepo(repoFullName: string) {
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    setImportingRepo(repoFullName);
    setImportState("importing");
    setImportMessage("Queued repository import");
    setError(null);

    try {
      const completed = await importGitHubRepositoryStream(
        repoFullName,
        (job) => {
          if (!mountedRef.current || controller.signal.aborted) return;
          setImportMessage(job.message);
        },
        controller.signal,
      );
      if (!mountedRef.current || controller.signal.aborted) return;

      if (!completed.project) {
        throw new Error("Import finished without a project.");
      }

      window.localStorage.removeItem("opendiagram:pending-github-repo");
      setImportedProject(completed.project);
      setImportState("done");
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Could not import GitHub repository.");
      setImportState("idle");
    } finally {
      if (importAbortRef.current === controller) importAbortRef.current = null;
    }
  }

  const filteredRepositories = repositories.filter((repo) =>
    repo.fullName.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const isSignedOut = !session.isPending && !session.data;

  return (
    <main className="min-h-dvh bg-white px-4 py-6 text-od-ink md:px-8">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-[#d9d9d9] px-4 py-2 text-[14px] text-od-ink transition hover:bg-od-surface"
          >
            <ArrowLeft className="h-4 w-4" />
            Back home
          </Link>
          <Link
            href="/dashboard"
            className="relative isolate overflow-hidden rounded-full bg-od-ink px-4 py-2 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a]"
          >
            <ButtonShaderTexture />
            Open dashboard
          </Link>
        </header>

        <section className="grid min-h-[calc(100dvh-120px)] grid-cols-1 overflow-hidden rounded-[28px] border border-[#d9d9d9] bg-od-surface-elevated lg:grid-cols-[0.85fr_1.15fr]">
          <aside className="flex flex-col justify-between gap-10 border-b border-[#d9d9d9] bg-od-ink p-8 text-od-on-dark lg:border-b-0 lg:border-r">
            <div className="flex flex-col gap-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-od-ink">
                <GithubLogoIcon size={28} weight="regular" />
              </div>
              <div className="flex flex-col gap-4">
                <p className="text-[13px] uppercase tracking-[0.22em] text-white/50">
                  GitHub import
                </p>
                <h1 className="max-w-[430px] text-[48px] font-normal leading-[1.02] -tracking-[0.06em] md:text-[64px]">
                  Bring your repo into OpenDiagram.
                </h1>
                <p className="max-w-[430px] text-[16px] leading-[1.7] text-white/70">
                  Connect GitHub, choose a repository, and start generating architecture diagrams
                  from real project structure.
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-[13px] text-white/70">
              {progressSteps.map((item, index) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-white/20 text-[11px] text-white">
                    {index + 1}
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </aside>

          <div className="flex min-h-[620px] items-center justify-center p-5 md:p-8">
            {session.isPending && <LoadingPanel label="Checking GitHub connection" />}
            {isSignedOut && (
              <ConnectPanel
                requestedRepo={requestedRepo}
                authPending={authPending}
                error={error}
                onConnect={connectGitHub}
              />
            )}
            {session.data && importState === "importing" && (
              <ImportingPanel
                message={importMessage}
                repoFullName={selectedRepo ?? "selected repository"}
              />
            )}
            {session.data && importState === "done" && importedProject && (
              <DonePanel project={importedProject} />
            )}
            {session.data && importState === "idle" && (
              <RepositoryPicker
                query={query}
                loadState={loadState}
                repositories={filteredRepositories}
                requestedRepo={requestedRepo}
                importingRepo={importingRepo}
                error={error}
                onQueryChange={setQuery}
                onImport={importSelectedRepo}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ImportPageShell() {
  return (
    <main className="min-h-dvh bg-white px-4 py-6 text-od-ink md:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-48px)] w-full max-w-[1120px] items-center justify-center">
        <LoadingPanel label="Preparing GitHub import" />
      </div>
    </main>
  );
}

function ConnectPanel({
  requestedRepo,
  authPending,
  error,
  onConnect,
}: {
  requestedRepo: string;
  authPending: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  return (
    <div className="flex w-full max-w-[520px] flex-col gap-6 rounded-[24px] border border-[#d9d9d9] bg-white p-6 md:p-8">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-od-ink-faint">Step 1</p>
        <h2 className="text-[32px] font-normal leading-[1.1] -tracking-[0.04em]">
          Continue with GitHub
        </h2>
        <p className="text-[15px] leading-[1.7] text-od-ink-muted">
          OpenDiagram needs GitHub access only when you import a repository. After connecting, you
          can choose the project to analyze.
        </p>
      </div>

      {requestedRepo && (
        <div className="flex items-center gap-3 rounded-[16px] border border-[#d9d9d9] bg-od-surface p-4 text-[13px] text-od-ink-muted">
          <GitBranch className="h-4 w-4 shrink-0 text-od-ink" />
          <span className="min-w-0 truncate">{requestedRepo}</span>
        </div>
      )}

      {error && <p className="text-[13px] leading-5 text-red-600">{error}</p>}

      <button
        type="button"
        onClick={onConnect}
        disabled={authPending}
        className="relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-od-ink px-5 py-3 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a] disabled:cursor-wait disabled:opacity-70"
      >
        <ButtonShaderTexture />
        <GithubLogoIcon size={16} weight="regular" />
        {authPending ? "Opening GitHub..." : "Continue with GitHub"}
      </button>

      <div className="flex items-start gap-3 rounded-[16px] border border-[#d9d9d9] bg-od-surface p-4 text-[13px] leading-[1.7] text-od-ink-muted">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-od-ink" />
        <span>GitHub is used for repository access and OpenDiagram sign-in during import.</span>
      </div>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex w-full max-w-[440px] flex-col items-center gap-5 rounded-[24px] border border-[#d9d9d9] bg-white p-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-od-ink" />
      <h2 className="text-[28px] font-normal -tracking-[0.04em]">{label}</h2>
    </div>
  );
}

function RepositoryPicker({
  query,
  loadState,
  repositories,
  requestedRepo,
  importingRepo,
  error,
  onQueryChange,
  onImport,
}: {
  query: string;
  loadState: LoadState;
  repositories: GitHubRepository[];
  requestedRepo: string;
  importingRepo: string | null;
  error: string | null;
  onQueryChange: (value: string) => void;
  onImport: (repoFullName: string) => void;
}) {
  const canImportTypedRepo = query.trim().match(/^[\w.-]+\/[\w.-]+$/);

  return (
    <div className="flex w-full max-w-[720px] flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] uppercase tracking-[0.18em] text-od-ink-faint">Step 2</p>
        <h2 className="text-[34px] font-normal leading-[1.1] -tracking-[0.04em]">
          Select a repository
        </h2>
        <p className="text-[15px] leading-[1.7] text-od-ink-muted">
          Choose one of your GitHub repositories. OpenDiagram will use this context to prepare
          diagrams and documentation.
        </p>
      </div>

      <div className="flex h-12 items-center gap-2 rounded-full border border-[#d9d9d9] bg-white px-4 focus-within:ring-2 focus-within:ring-od-ink focus-within:ring-offset-2">
        <Search className="h-4 w-4 text-od-ink-faint" aria-hidden="true" />
        <label htmlFor="github-repository-search" className="sr-only">
          Search repositories
        </label>
        <input
          id="github-repository-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(normalizeRepoTarget(event.target.value))}
          placeholder="Search repositories or enter owner/repo"
          className="w-full bg-transparent text-[14px] outline-none placeholder:text-od-ink-faint"
        />
      </div>

      {error && <p className="text-[13px] leading-5 text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-[18px] border border-[#d9d9d9] bg-white">
        <div className="grid grid-cols-[1fr_120px] gap-4 border-b border-[#d9d9d9] px-4 py-3 text-[12px] text-od-ink-faint">
          <span>Repository</span>
          <span className="text-right">Action</span>
        </div>

        {loadState === "loading" && (
          <div className="flex min-h-[260px] items-center justify-center gap-3 text-[14px] text-od-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading repositories
          </div>
        )}

        {loadState === "ready" && repositories.length > 0 && (
          <div className="max-h-[360px] overflow-y-auto">
            {repositories.map((repo) => (
              <div
                key={repo.id}
                className="grid grid-cols-[1fr_120px] items-center gap-4 border-b border-[#d9d9d9] px-4 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={repo.owner.avatarUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full border border-[#d9d9d9]"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[14px] font-medium text-od-ink">
                        {repo.fullName}
                      </h3>
                      {repo.private && (
                        <span className="rounded-full border border-[#d9d9d9] px-2 py-0.5 text-[11px] text-od-ink-faint">
                          Private
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[12px] text-od-ink-faint">
                      {repo.defaultBranch} · Updated {new Date(repo.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onImport(repo.fullName)}
                  className="justify-self-end rounded-full border border-[#d9d9d9] px-4 py-2 text-[13px] text-od-ink transition hover:bg-od-surface"
                >
                  {importingRepo === repo.fullName ? "Importing" : "Import"}
                </button>
              </div>
            ))}
          </div>
        )}

        {loadState === "ready" && repositories.length === 0 && (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-[18px] border border-[#d9d9d9] bg-od-surface text-od-ink">
              <GitBranch className="h-6 w-6" />
            </div>
            <div className="flex max-w-[420px] flex-col gap-2">
              <h3 className="text-[18px] text-od-ink">No matching repositories</h3>
              <p className="text-[14px] leading-[1.7] text-od-ink-muted">
                Search another repository or enter an owner/repo name you can access.
              </p>
            </div>
            {canImportTypedRepo && (
              <button
                type="button"
                onClick={() => onImport(query.trim())}
                className="rounded-full border border-[#d9d9d9] px-4 py-2 text-[13px] text-od-ink transition hover:bg-od-surface"
              >
                Import {query.trim()}
              </button>
            )}
          </div>
        )}

        {loadState === "error" && (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-[18px] border border-[#d9d9d9] bg-od-surface text-od-ink">
              <GithubLogoIcon size={24} weight="regular" />
            </div>
            <div className="flex max-w-[420px] flex-col gap-2">
              <h3 className="text-[18px] text-od-ink">Repository access failed</h3>
              <p className="text-[14px] leading-[1.7] text-od-ink-muted">
                Reconnect GitHub from the import button if your session expired.
              </p>
            </div>
            {requestedRepo && (
              <button
                type="button"
                onClick={() => onImport(requestedRepo)}
                className="rounded-full border border-[#d9d9d9] px-4 py-2 text-[13px] text-od-ink transition hover:bg-od-surface"
              >
                Try importing {requestedRepo}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ImportingPanel({ message, repoFullName }: { message: string; repoFullName: string }) {
  return (
    <div className="flex w-full max-w-[500px] flex-col gap-5 rounded-[24px] border border-[#d9d9d9] bg-white p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin" />
        <h2 className="text-[28px] font-normal -tracking-[0.04em]">Importing {repoFullName}</h2>
      </div>
      <p className="text-[14px] leading-[1.7] text-od-ink-muted">{message}</p>
      <div className="flex flex-col gap-3">
        {progressSteps.map((item) => (
          <div
            key={item}
            className="flex items-center gap-3 rounded-[14px] border border-[#d9d9d9] p-3 text-[14px] text-od-ink-muted"
          >
            <span className="h-2 w-2 rounded-full bg-od-green" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function DonePanel({ project }: { project: ImportedGitHubProject }) {
  return (
    <div className="flex w-full max-w-[480px] flex-col items-center gap-5 rounded-[24px] border border-[#d9d9d9] bg-white p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-od-green text-white">
        <Check className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-[30px] font-normal -tracking-[0.04em]">Project imported</h2>
        <p className="text-[14px] leading-[1.7] text-od-ink-muted">
          {project.name} is connected. The next step is generating architecture diagrams and
          documentation from the repository.
        </p>
      </div>
      <Link
        href={`/project/${project.id}/workspace`}
        className="relative isolate overflow-hidden rounded-full bg-od-ink px-5 py-3 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a]"
      >
        <ButtonShaderTexture />
        Open workspace
      </Link>
    </div>
  );
}

function normalizeRepoTarget(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  return trimmed
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");
}
