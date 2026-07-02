import { Star, MoreHorizontal } from "lucide-react";
import { DiagramThumb } from "./diagram-thumb";
import { avatarColor, type DiagramFile } from "./data";

function Avatars({ people }: { people: string[] }) {
  return (
    <div className="flex -space-x-2">
      {people.map((p) => (
        <div
          key={p}
          className="grid h-6 w-6 place-items-center rounded-full border border-white text-[10px] text-[var(--od-on-dark)]"
          style={{ backgroundColor: avatarColor(p) }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}

export function FileCard({ file }: { file: DiagramFile }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-[16px] border border-[var(--od-border-soft)] bg-[var(--od-surface-elevated)] backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
      <div className="relative aspect-square overflow-hidden border-b border-[var(--od-border-soft)]">
        <DiagramThumb variant={file.variant} />
        {file.live && (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-[999px] bg-[var(--od-surface)] px-2.5 py-1 text-[11px] text-[var(--od-ink)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--od-green)]" />
            Live
          </span>
        )}
        <button className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-[var(--od-surface)] text-[var(--od-ink-faint)] opacity-0 transition group-hover:opacity-100">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] text-[var(--od-ink)]">{file.title}</h3>
          <Star
            className={`h-4 w-4 shrink-0 ${
              file.starred
                ? "fill-[var(--od-ink)] text-[var(--od-ink)]"
                : "text-[var(--od-ink-faint)]"
            }`}
          />
        </div>
        <p className="text-[12px] text-[var(--od-ink-faint)]">{file.folder}</p>
        <div className="flex items-center justify-between">
          <Avatars people={file.collaborators} />
          <span className="text-[12px] text-[var(--od-ink-faint)]">{file.edited}</span>
        </div>
      </div>
    </article>
  );
}

export function FileRow({ file }: { file: DiagramFile }) {
  return (
    <article className="group flex items-center gap-4 rounded-[12px] border border-[var(--od-border-soft)] bg-[var(--od-surface-elevated)] px-3 py-2.5 backdrop-blur-sm transition hover:bg-white">
      <div className="h-12 w-20 shrink-0 overflow-hidden rounded-[8px] border border-[var(--od-border-soft)]">
        <DiagramThumb variant={file.variant} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[15px] text-[var(--od-ink)]">{file.title}</h3>
          {file.live && <span className="inline-block h-2 w-2 rounded-full bg-[var(--od-green)]" />}
        </div>
        <p className="truncate text-[12px] text-[var(--od-ink-faint)]">{file.folder}</p>
      </div>
      <span className="hidden text-[13px] text-[var(--od-ink-faint)] sm:block">{file.edited}</span>
      <Avatars people={file.collaborators} />
      <Star
        className={`h-4 w-4 shrink-0 ${
          file.starred ? "fill-[var(--od-ink)] text-[var(--od-ink)]" : "text-[var(--od-ink-faint)]"
        }`}
      />
    </article>
  );
}
