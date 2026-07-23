import Link from "next/link";
import { GithubLogoIcon } from "@phosphor-icons/react";
import { Check, GitBranch, Loader2, Lock } from "lucide-react";
import type { ImportedGitHubProject } from "@/lib/github-import-client";

const progressSteps = [
  "Reading repository structure",
  "Detecting services and dependencies",
  "Preparing architecture workspace",
];

export function ImportPageShell() {
  return (
    <main className="min-h-dvh bg-white px-4 py-6 text-od-ink md:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-48px)] w-full max-w-[1120px] items-center justify-center">
        <LoadingPanel label="Preparing GitHub import" />
      </div>
    </main>
  );
}

export function ConnectPanel({
  isAuthenticated,
  requestedRepo,
  authPending,
  error,
  onConnect,
}: {
  isAuthenticated: boolean;
  requestedRepo: string;
  authPending: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  return (
    <div className="flex w-full max-w-[520px] flex-col gap-6 rounded-[24px] border border-[#d9d9d9] bg-white p-6 md:p-8">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-od-ink-faint">
          {isAuthenticated ? "One-time connection" : "Step 1"}
        </p>
        <h2 className="text-[32px] font-normal leading-[1.1] -tracking-[0.04em]">
          {isAuthenticated ? "Connect GitHub to continue" : "Continue with GitHub"}
        </h2>
        <p className="text-[15px] leading-[1.7] text-od-ink-muted">
          {isAuthenticated
            ? "Authorize GitHub once to access your public repositories. Your OpenDiagram account and session will stay unchanged."
            : "Sign in with GitHub to access your public repositories and choose one to analyze."}
        </p>
      </div>

      {requestedRepo && (
        <div className="flex items-center gap-3 rounded-[16px] border border-[#d9d9d9] bg-od-surface p-4 text-[13px] text-od-ink-muted">
          <GitBranch className="h-4 w-4 shrink-0 text-od-ink" />
          <span className="min-w-0 truncate">{requestedRepo}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] leading-5 text-red-700"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onConnect}
        disabled={authPending}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-od-ink px-5 py-3 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a] active:translate-y-px disabled:cursor-wait disabled:opacity-70"
      >
        <GithubLogoIcon size={16} weight="regular" />
        {authPending
          ? "Opening GitHub..."
          : isAuthenticated
            ? "Connect GitHub"
            : "Continue with GitHub"}
      </button>

      <div className="flex items-start gap-3 rounded-[16px] border border-[#d9d9d9] bg-od-surface p-4 text-[13px] leading-[1.7] text-od-ink-muted">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-od-ink" />
        <span>
          {isAuthenticated
            ? "GitHub is used only for repository access. Your OpenDiagram session stays active."
            : "GitHub is used for repository access and OpenDiagram sign-in during import."}
        </span>
      </div>
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex w-full max-w-[440px] flex-col items-center gap-5 rounded-[24px] border border-[#d9d9d9] bg-white p-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-od-ink" />
      <h2 className="text-[28px] font-normal -tracking-[0.04em]">{label}</h2>
    </div>
  );
}

export function ImportingPanel({
  message,
  repoFullName,
}: {
  message: string;
  repoFullName: string;
}) {
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

export function DonePanel({ project }: { project: ImportedGitHubProject }) {
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
        className="rounded-full bg-od-ink px-5 py-3 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a] active:translate-y-px"
      >
        Open workspace
      </Link>
    </div>
  );
}
