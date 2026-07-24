"use client";

import { GithubLogoIcon } from "@phosphor-icons/react";
import { GitBranch, Loader2, Search } from "lucide-react";
import type { GitHubRepository } from "@/lib/github-import-client";
import { normalizeRepoTarget, type LoadState } from "./github-import-utils";

export function RepositoryPicker({
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
