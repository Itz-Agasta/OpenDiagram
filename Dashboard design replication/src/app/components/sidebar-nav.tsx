import {
  Home,
  Clock,
  Users,
  Star,
  Trash2,
  Folder,
  Plus,
  ChevronDown,
  Settings,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "recent", label: "Recent", icon: Clock },
  { id: "shared", label: "Shared with me", icon: Users },
  { id: "starred", label: "Starred", icon: Star },
  { id: "trash", label: "Trash", icon: Trash2 },
];

const projects = [
  { id: "f1", label: "Platform Architecture", count: 12 },
  { id: "f2", label: "API Design", count: 8 },
  { id: "f3", label: "Infra & Cloud", count: 5 },
  { id: "f4", label: "Onboarding Docs", count: 3 },
];

export function SidebarNav({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  const [foldersOpen, setFoldersOpen] = useState(true);

  return (
    <aside className="hidden md:flex w-[264px] shrink-0 flex-col gap-6 border-r border-[var(--od-border-soft)] bg-[var(--od-surface-muted)] px-4 py-5 backdrop-blur-sm">
      {/* Workspace switcher */}
      <button className="flex items-center gap-3 rounded-[8px] bg-[var(--od-surface)] px-3 py-2.5 text-left transition hover:bg-white">
        <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-[var(--od-ink)] text-[var(--od-on-dark)]">
          <span className="text-[15px]">OD</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-[var(--od-ink)]">Core Platform</p>
          <p className="truncate text-[12px] text-[var(--od-ink-faint)]">Team workspace</p>
        </div>
        <ChevronDown className="h-4 w-4 text-[var(--od-ink-faint)]" />
      </button>

      {/* New diagram */}
      <button className="flex items-center justify-center gap-2 rounded-[999px] bg-[var(--od-ink)] px-6 py-3 text-[14px] text-[var(--od-on-dark)] transition hover:bg-[#2a2a2a] active:translate-y-px">
        <Plus className="h-4 w-4" />
        New diagram
      </button>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-3 rounded-[8px] px-3 py-2 text-[14px] transition ${
                isActive
                  ? "bg-[var(--od-surface)] text-[var(--od-ink)]"
                  : "text-[var(--od-ink-muted)] hover:bg-[var(--od-surface-muted)]"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Projects */}
      <div className="flex min-h-0 flex-1 flex-col">
        <button
          onClick={() => setFoldersOpen((v) => !v)}
          className="mb-1 flex items-center justify-between px-3 py-1 text-[12px] uppercase tracking-wide text-[var(--od-ink-faint)]"
        >
          Projects
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${foldersOpen ? "" : "-rotate-90"}`}
          />
        </button>
        {foldersOpen && (
          <div className="flex flex-col gap-0.5 overflow-y-auto">
            {projects.map((f) => (
              <button
                key={f.id}
                className="group flex items-center gap-3 rounded-[8px] px-3 py-2 text-[14px] text-[var(--od-ink-muted)] transition hover:bg-[var(--od-surface-muted)]"
              >
                <Folder className="h-[18px] w-[18px]" />
                <span className="flex-1 truncate text-left">{f.label}</span>
                <span className="text-[12px] text-[var(--od-ink-faint)]">{f.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User */}
      <div className="flex items-center gap-3 border-t border-[var(--od-border-soft)] pt-4">
        <div className="grid h-9 w-9 place-items-center rounded-full border border-white bg-[var(--od-ink)] text-[13px] text-[var(--od-on-dark)]">
          ML
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-[var(--od-ink)]">Mira Lund</p>
          <p className="flex items-center gap-1.5 truncate text-[12px] text-[var(--od-ink-faint)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--od-green)]" />
            Online
          </p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-full text-[var(--od-ink-faint)] transition hover:bg-[var(--od-surface-muted)]">
          <Settings className="h-[18px] w-[18px]" />
        </button>
      </div>
    </aside>
  );
}
