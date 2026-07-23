import { useEffect, useState } from "react";
import { FileText, PenTool, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentInputSubmit, FileKind } from "./types";

const agentModes = [
  { label: "Canvas", icon: PenTool, kind: "diagram" as const },
  { label: "Doc", icon: FileText, kind: "doc" as const },
];
const agentCtas = [
  "Describe it, watch it draw itself.",
  "Your repo has a story, let it vibe out a diagram.",
  "Type a vibe, get an architecture.",
  "Skip the whiteboard, vibe the diagram instead.",
  "Diagrams, vibed into existence.",
];
const presetTags = [
  "Netflix system design",
  "WhatsApp architecture",
  "Uber backend architecture",
  "Twitter architecture",
  "YouTube system design",
  "Slack architecture",
  "Amazon shopping flow",
  "Spotify streaming architecture",
];

interface AgentInputPanelProps {
  creating: boolean;
  onSubmit: (input: AgentInputSubmit) => void;
}

export function AgentInputPanel({ creating, onSubmit }: AgentInputPanelProps) {
  const [selectedMode, setSelectedMode] = useState<FileKind>("diagram");
  const [prompt, setPrompt] = useState("");
  const [ctaIndex, setCtaIndex] = useState(0);
  useEffect(() => setCtaIndex(Math.floor(Math.random() * agentCtas.length)), []);

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center px-0 py-4 md:px-6 md:py-5">
      <p className="mb-3 max-w-[680px] px-2 text-center text-[20px] font-serif italic leading-tight text-od-ink md:mb-4 md:text-[24px]">
        {agentCtas[ctaIndex]}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = prompt.trim();
          if (text && !creating) {
            onSubmit({ prompt: text, kind: selectedMode });
          }
        }}
        className="w-full max-w-[680px] overflow-hidden rounded-[20px] border border-black/10 bg-white shadow-[0_14px_28px_-24px_rgba(0,0,0,0.7)] md:rounded-[24px]"
      >
        <div className="rounded-t-[20px] border-t border-black/5 px-4 pb-4 pt-4 md:rounded-t-[24px] md:px-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {agentModes.map(({ label, icon: Icon, kind }) => (
              <button
                key={label}
                type="button"
                aria-pressed={selectedMode === kind}
                disabled={creating}
                onClick={() => setSelectedMode(kind)}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-black/10 bg-white px-3 text-[13px] font-semibold text-[#151515] transition hover:bg-black/[0.03] aria-pressed:border-black/20 aria-pressed:bg-black/[0.04] md:text-[14px]"
              >
                <Icon className="h-4 w-4 text-black/55" />
                {label}
              </button>
            ))}
          </div>
          <label className="mt-4 block">
            <span className="sr-only">Describe what OpenDiagram should create</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={creating}
              placeholder="Make a system design for a collaborative AI workspace"
              className="min-h-[48px] w-full resize-none border-0 bg-transparent px-1 text-[15px] leading-[1.35] text-[#242424] outline-none placeholder:text-black/45 disabled:cursor-wait disabled:opacity-70 md:min-h-[56px] md:text-[17px]"
            />
          </label>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="inline-flex h-8 min-w-0 items-center gap-1.5 px-2 text-[13px] font-semibold text-[#9ca3af]">
              <Sparkles aria-hidden="true" />
              <span className="truncate">Picasso</span>
            </span>
            <button
              type="submit"
              disabled={creating || prompt.trim().length === 0}
              className="h-9 rounded-[10px] bg-od-ink px-4 text-[13px] font-semibold text-white transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

export function PresetTagRow({ creating, onSubmit }: AgentInputPanelProps) {
  const [tags, setTags] = useState(() => presetTags.slice(0, 4));
  useEffect(() => setTags([...presetTags].sort(() => Math.random() - 0.5).slice(0, 4)), []);
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          disabled={creating}
          onClick={() => onSubmit({ prompt: tag, kind: "diagram" })}
          className="inline-flex h-7 shrink-0 items-center rounded-full border border-od-border-soft bg-od-surface-elevated px-3 text-[12px] font-medium text-od-ink-muted transition hover:border-od-ink/20 hover:text-od-ink disabled:cursor-wait disabled:opacity-40"
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

export function AgentInputPanelSkeleton() {
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center px-0 py-6 md:px-6 md:py-8">
      <Skeleton className="mb-4 h-8 w-full max-w-[520px] md:mb-5" />
      <div className="w-full max-w-[680px] rounded-[20px] border border-black/10 bg-white p-5">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="mt-4 h-6 w-full max-w-[420px]" />
        <Skeleton className="mt-3 h-6 w-full max-w-[260px]" />
      </div>
    </section>
  );
}
