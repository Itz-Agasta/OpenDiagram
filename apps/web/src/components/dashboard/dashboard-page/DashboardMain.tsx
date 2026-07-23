import Image from "next/image";
import Link from "next/link";
import { GithubLogoIcon } from "@phosphor-icons/react";
import { AgentInputPanel, AgentInputPanelSkeleton, PresetTagRow } from "./AgentInputPanel";
import type { AgentInputSubmit } from "./types";

interface DashboardMainProps {
  creating: boolean;
  loading: boolean;
  onCreate: (input: AgentInputSubmit) => void;
}

export function DashboardMain({ creating, loading, onCreate }: DashboardMainProps) {
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-od-surface">
      <header className="z-20 flex h-16 shrink-0 items-center gap-3 bg-od-surface px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label="OpenDiagram home"
            className="grid size-9 shrink-0 place-items-center"
          >
            <Image src="/new_logo.png" alt="" width={36} height={36} className="size-9" />
          </Link>
          <h1 className="truncate text-[18px] font-semibold leading-tight">OpenDiagram</h1>
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 flex-col gap-4 overflow-hidden bg-od-surface p-4 md:p-8">
        {loading ? (
          <AgentInputPanelSkeleton />
        ) : (
          <>
            <AgentInputPanel creating={creating} onSubmit={onCreate} />
            <PresetTagRow creating={creating} onSubmit={onCreate} />
            <div className="mt-8 flex flex-col items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="h-px w-16 bg-od-border-soft" />
                <span className="text-[12px] font-medium uppercase tracking-wider text-od-ink-faint">
                  Or
                </span>
                <span className="h-px w-16 bg-od-border-soft" />
              </div>
              <Link
                href="/import/github"
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-od-border-soft bg-white px-5 py-2.5 text-[14px] font-semibold text-od-ink shadow-sm transition hover:bg-od-surface-elevated"
              >
                <GithubLogoIcon size={16} weight="regular" />
                Import your project from GitHub
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
