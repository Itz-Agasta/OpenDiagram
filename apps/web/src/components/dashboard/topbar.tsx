import { Search, Menu } from "lucide-react";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-od-border-soft bg-od-surface-elevated px-4 py-3 backdrop-blur-md md:px-8">
      <button className="grid h-10 w-10 place-items-center rounded-full bg-od-surface text-od-ink md:hidden">
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex h-11 flex-1 items-center gap-2 rounded-[999px] bg-od-surface px-4">
        <Search className="h-[18px] w-[18px] text-od-ink-faint" />
        <input
          placeholder="Search diagrams, docs and folders…"
          className="w-full border-0 bg-transparent text-[14px] text-od-ink outline-none placeholder:text-od-ink-faint"
        />
      </div>
    </header>
  );
}
