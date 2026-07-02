import { Sparkles, ArrowUpRight } from "lucide-react";
import { DiagramThumb } from "./diagram-thumb";
import { templates } from "./data";

export function TemplateRow() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span className="font-editorial text-[24px] leading-none text-[var(--od-ink)]">
          Start something
        </span>
        <span className="text-[13px] text-[var(--od-ink-faint)]">
          Pick a canvas or let AI draft one
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {templates.map((t) => (
          <button
            key={t.id}
            className={`group flex flex-col overflow-hidden rounded-[16px] border text-left transition hover:-translate-y-0.5 ${
              t.ai
                ? "border-transparent bg-[var(--od-dark-panel)]"
                : "border-[var(--od-border-soft)] bg-[var(--od-surface-elevated)] backdrop-blur-sm hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            }`}
          >
            <div className="aspect-[16/10] overflow-hidden border-b border-[var(--od-border-soft)]">
              {t.ai ? (
                <div className="grid h-full w-full place-items-center bg-[var(--od-dark-panel)]">
                  <Sparkles className="h-8 w-8 text-[var(--od-on-dark)]" strokeWidth={1.5} />
                </div>
              ) : (
                <DiagramThumb variant={t.variant} />
              )}
            </div>
            <div className={`flex items-start justify-between gap-2 p-3 ${t.ai ? "" : ""}`}>
              <div>
                <p
                  className={`text-[14px] ${t.ai ? "text-[var(--od-on-dark)]" : "text-[var(--od-ink)]"}`}
                >
                  {t.title}
                </p>
                <p
                  className={`text-[12px] ${
                    t.ai ? "text-[var(--od-on-dark-muted)]" : "text-[var(--od-ink-faint)]"
                  }`}
                >
                  {t.desc}
                </p>
              </div>
              <ArrowUpRight
                className={`h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
                  t.ai ? "text-[var(--od-on-dark)]" : "text-[var(--od-ink-faint)]"
                }`}
              />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
