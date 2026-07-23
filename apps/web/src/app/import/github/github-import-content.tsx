"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authClient, frontendCallbackURL } from "@/lib/auth-client";
import {
  importGitHubRepositoryStream,
  listGitHubRepositories,
  type ImportedGitHubProject,
  type GitHubRepository,
} from "@/lib/github-import-client";
import { ConnectPanel, DonePanel, ImportingPanel, LoadingPanel } from "./github-import-panels";
import { RepositoryPicker } from "./repository-picker";
import {
  GITHUB_CONNECTION_REQUIRED_ERROR,
  getOAuthErrorMessage,
  normalizeRepoTarget,
  type ImportState,
  type LoadState,
} from "./github-import-utils";

export function GitHubImportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const oauthErrorHandledRef = useRef(false);

  const requestedRepo = useMemo(() => {
    const fromQuery = normalizeRepoTarget(searchParams.get("repo") ?? "");

    if (fromQuery) return fromQuery;
    if (typeof window === "undefined") return "";

    return window.localStorage.getItem("opendiagram:pending-github-repo") ?? "";
  }, [searchParams]);
  const oauthError = searchParams.get("error");

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
    if (!oauthError) return;
    oauthErrorHandledRef.current = true;
    setGithubConnected(false);
    setLoadState("error");
    setError(getOAuthErrorMessage(oauthError));

    const cleanURL = new URL(window.location.href);
    cleanURL.searchParams.delete("error");
    cleanURL.searchParams.delete("error_description");
    router.replace(`${cleanURL.pathname}${cleanURL.search}`);
  }, [oauthError, router]);

  useEffect(() => {
    if (session.isPending || !session.data || oauthErrorHandledRef.current) return;

    let active = true;

    async function loadRepositories() {
      setLoadState("loading");
      setError(null);

      try {
        const repos = await listGitHubRepositories();
        if (!active) return;

        setRepositories(repos);
        setGithubConnected(true);
        setLoadState("ready");

        if (
          requestedRepo &&
          repos.some((repo) => repo.fullName.toLowerCase() === requestedRepo.toLowerCase())
        ) {
          setSelectedRepo(requestedRepo);
        }
      } catch (err) {
        if (!active) return;

        const message = err instanceof Error ? err.message : "Could not load GitHub repositories.";
        const requiresConnection =
          message === GITHUB_CONNECTION_REQUIRED_ERROR ||
          (err instanceof Error && "status" in err && err.status === 401);
        setGithubConnected(requiresConnection ? false : true);
        setError(
          requiresConnection ? "Connect GitHub to access your public repositories." : message,
        );
        setLoadState("error");
      }
    }

    void loadRepositories();

    return () => {
      active = false;
    };
  }, [requestedRepo, session.data, session.isPending]);

  async function connectGitHub() {
    oauthErrorHandledRef.current = false;
    setAuthPending(true);
    setError(null);
    const callbackPath = `/import/github${
      requestedRepo ? `?repo=${encodeURIComponent(requestedRepo)}` : ""
    }`;

    try {
      const callbackURL = frontendCallbackURL(callbackPath);
      if (session.data?.user) {
        await authClient.linkSocial({
          provider: "github",
          callbackURL,
          errorCallbackURL: callbackURL,
          scopes: ["read:user", "user:email"],
        });
      } else {
        await authClient.signIn.social({
          provider: "github",
          callbackURL,
          errorCallbackURL: callbackURL,
          scopes: ["read:user", "user:email"],
        });
      }
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
  const needsGitHubConnection = isSignedOut || githubConnected === false;

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
            className="rounded-full bg-od-ink px-4 py-2 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a] active:translate-y-px"
          >
            Open dashboard
          </Link>
        </header>

        <section className="mx-auto flex min-h-[calc(100dvh-120px)] w-full max-w-[760px] items-center justify-center rounded-[28px] bg-od-surface-elevated p-5 md:p-8">
          <div className="flex w-full items-center justify-center">
            {session.isPending ? (
              <LoadingPanel label="Checking GitHub connection" />
            ) : needsGitHubConnection ? (
              <ConnectPanel
                isAuthenticated={Boolean(session.data?.user)}
                requestedRepo={requestedRepo}
                authPending={authPending}
                error={error}
                onConnect={connectGitHub}
              />
            ) : session.data && importState === "importing" ? (
              <ImportingPanel
                message={importMessage}
                repoFullName={selectedRepo ?? "selected repository"}
              />
            ) : session.data && importState === "done" && importedProject ? (
              <DonePanel project={importedProject} />
            ) : session.data && githubConnected === true && importState === "idle" ? (
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
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
