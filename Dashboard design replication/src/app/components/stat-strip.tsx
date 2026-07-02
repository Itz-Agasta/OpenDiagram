const stats = [
  { label: "Diagrams", value: "28" },
  { label: "Shared docs", value: "14" },
  { label: "Collaborators", value: "9" },
  { label: "Live now", value: "2", accent: true },
];

export function StatStrip() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-[16px] border border-[var(--od-border-soft)] bg-[var(--od-surface-muted)] px-5 py-4 backdrop-blur-sm"
        >
          <p className="flex items-center gap-2 text-[28px] leading-none text-[var(--od-ink)]">
            {s.value}
            {s.accent && (
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--od-green)]" />
            )}
          </p>
          <p className="mt-2 text-[13px] text-[var(--od-ink-faint)]">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
