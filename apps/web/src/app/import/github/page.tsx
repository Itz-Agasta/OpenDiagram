"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GithubLogoIcon } from "@phosphor-icons/react";
import {
  ArrowLeft,
  Check,
  GitBranch,
  Loader2,
  Search,
} from "lucide-react";

type Step = "connect" | "redirecting" | "picker" | "importing" | "done";

const progressSteps = [
  "Reading repository structure",
  "Detecting services and dependencies",
  "Preparing architecture workspace",
];

export default function GitHubImportPage() {
  const [step, setStep] = useState<Step>("connect");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (step !== "redirecting") {
      return;
    }

    const timeout = window.setTimeout(() => setStep("picker"), 900);
    return () => window.clearTimeout(timeout);
  }, [step]);

  useEffect(() => {
    if (step !== "importing") {
      return;
    }

    const timeout = window.setTimeout(() => setStep("done"), 1200);
    return () => window.clearTimeout(timeout);
  }, [step]);

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
            className="rounded-full bg-od-ink px-4 py-2 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a]"
          >
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
                  Connect GitHub, choose a repository, and start generating architecture diagrams from real project structure.
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
            {step === "connect" && <ConnectPanel onConnect={() => setStep("redirecting")} />}
            {step === "redirecting" && <RedirectingPanel />}
            {step === "picker" && (
              <RepositoryPicker
                query={query}
                onQueryChange={setQuery}
                onImport={() => setStep("importing")}
              />
            )}
            {step === "importing" && <ImportingPanel />}
            {step === "done" && <DonePanel />}
          </div>
        </section>
      </div>
    </main>
  );
}

function ConnectPanel({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex w-full max-w-[520px] flex-col gap-6 rounded-[24px] border border-[#d9d9d9] bg-white p-6 md:p-8">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-od-ink-faint">
          Step 1
        </p>
        <h2 className="text-[32px] font-normal leading-[1.1] -tracking-[0.04em]">
          Continue with GitHub
        </h2>
        <p className="text-[15px] leading-[1.7] text-od-ink-muted">
          This UI is ready for OAuth. For now, clicking continue simulates returning from GitHub so you can review the import experience.
        </p>
      </div>

      <button
        type="button"
        onClick={onConnect}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-od-ink px-5 py-3 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a]"
      >
        <GithubLogoIcon size={16} weight="regular" />
        Continue with GitHub
      </button>

      <div className="rounded-[16px] border border-[#d9d9d9] bg-od-surface p-4 text-[13px] leading-[1.7] text-od-ink-muted">
        When OAuth is connected, repositories returned by GitHub will appear in the picker. No repository data is fabricated here.
      </div>
    </div>
  );
}

function RedirectingPanel() {
  return (
    <div className="flex w-full max-w-[440px] flex-col items-center gap-5 rounded-[24px] border border-[#d9d9d9] bg-white p-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-od-ink" />
      <div className="flex flex-col gap-2">
        <h2 className="text-[28px] font-normal -tracking-[0.04em]">Returning from GitHub</h2>
        <p className="text-[14px] leading-[1.7] text-od-ink-muted">
          Simulating the redirect back into OpenDiagram.
        </p>
      </div>
    </div>
  );
}

function RepositoryPicker({
  query,
  onQueryChange,
  onImport,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onImport: () => void;
}) {
  return (
    <div className="flex w-full max-w-[680px] flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] uppercase tracking-[0.18em] text-od-ink-faint">
          Step 2
        </p>
        <h2 className="text-[34px] font-normal leading-[1.1] -tracking-[0.04em]">
          Select a repository
        </h2>
        <p className="text-[15px] leading-[1.7] text-od-ink-muted">
          Real repositories will populate this table after GitHub OAuth and repository permissions are wired.
        </p>
      </div>

      <div className="flex h-12 items-center gap-2 rounded-full border border-[#d9d9d9] bg-white px-4">
        <Search className="h-4 w-4 text-od-ink-faint" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search repositories after connecting GitHub"
          className="w-full bg-transparent text-[14px] outline-none placeholder:text-od-ink-faint"
        />
      </div>

      <div className="overflow-hidden rounded-[18px] border border-[#d9d9d9] bg-white">
        <div className="grid grid-cols-[1fr_120px] gap-4 border-b border-[#d9d9d9] px-4 py-3 text-[12px] text-od-ink-faint">
          <span>Repository</span>
          <span className="text-right">Action</span>
        </div>
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-[18px] border border-[#d9d9d9] bg-od-surface text-od-ink">
            <GitBranch className="h-6 w-6" />
          </div>
          <div className="flex max-w-[410px] flex-col gap-2">
            <h3 className="text-[18px] text-od-ink">No repositories loaded yet</h3>
            <p className="text-[14px] leading-[1.7] text-od-ink-muted">
              This is intentionally empty until a real GitHub connection supplies repository data.
            </p>
          </div>
          <button
            type="button"
            onClick={onImport}
            className="rounded-full border border-[#d9d9d9] px-4 py-2 text-[13px] text-od-ink transition hover:bg-od-surface"
          >
            Preview import progress
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportingPanel() {
  return (
    <div className="flex w-full max-w-[500px] flex-col gap-5 rounded-[24px] border border-[#d9d9d9] bg-white p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin" />
        <h2 className="text-[28px] font-normal -tracking-[0.04em]">Preparing import</h2>
      </div>
      <div className="flex flex-col gap-3">
        {progressSteps.map((item) => (
          <div key={item} className="flex items-center gap-3 rounded-[14px] border border-[#d9d9d9] p-3 text-[14px] text-od-ink-muted">
            <span className="h-2 w-2 rounded-full bg-od-green" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function DonePanel() {
  return (
    <div className="flex w-full max-w-[480px] flex-col items-center gap-5 rounded-[24px] border border-[#d9d9d9] bg-white p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-od-green text-white">
        <Check className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-[30px] font-normal -tracking-[0.04em]">Import UI ready</h2>
        <p className="text-[14px] leading-[1.7] text-od-ink-muted">
          The interface is ready for the real GitHub repository payload when backend OAuth is added.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-full bg-od-ink px-5 py-3 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a]"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
