import { Search, LayoutGrid, List, Bell, Menu } from "lucide-react";

export function Topbar({
  view,
  onViewChange,
}: {
  view: "grid" | "list";
  onViewChange: (v: "grid" | "list") => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--od-border-soft)] bg-[var(--od-surface-elevated)] px-4 py-3 backdrop-blur-md md:px-8">
      <button className="grid h-10 w-10 place-items-center rounded-full bg-[var(--od-surface)] text-[var(--od-ink)] md:hidden">
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex h-11 flex-1 items-center gap-2 rounded-[999px] bg-[var(--od-surface)] px-4">
        <Search className="h-[18px] w-[18px] text-[var(--od-ink-faint)]" />
        <input
          placeholder="Search diagrams, docs and folders…"
          className="w-full border-0 bg-transparent text-[14px] text-[var(--od-ink)] outline-none placeholder:text-[var(--od-ink-faint)]"
        />
      </div>

      <div className="hidden items-center rounded-[999px] bg-[var(--od-surface)] p-1 sm:flex">
        <button
          onClick={() => onViewChange("grid")}
          className={`grid h-9 w-9 place-items-center rounded-full transition ${
            view === "grid"
              ? "bg-[var(--od-ink)] text-[var(--od-on-dark)]"
              : "text-[var(--od-ink-faint)]"
          }`}
        >
          <LayoutGrid className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={() => onViewChange("list")}
          className={`grid h-9 w-9 place-items-center rounded-full transition ${
            view === "list"
              ? "bg-[var(--od-ink)] text-[var(--od-on-dark)]"
              : "text-[var(--od-ink-faint)]"
          }`}
        >
          <List className="h-[18px] w-[18px]" />
        </button>
      </div>

      <button className="grid h-11 w-11 place-items-center rounded-full bg-[var(--od-surface)] text-[var(--od-ink)]">
        <Bell className="h-[18px] w-[18px]" />
      </button>
    </header>
  );
}
