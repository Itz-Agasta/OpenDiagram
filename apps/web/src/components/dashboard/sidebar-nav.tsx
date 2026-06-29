"use client";

import { useState } from "react";
import {
  Home,
  Clock,
  Users,
  Star,
  Trash2,
  Plus,
  ChevronDown,
  Settings,
} from "lucide-react";

const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "recent", label: "Recent", icon: Clock },
  { id: "shared", label: "Shared with me", icon: Users },
  { id: "starred", label: "Starred", icon: Star },
  { id: "trash", label: "Trash", icon: Trash2 },
];

export function SidebarNav({
  active,
  onSelect,
  onCreateDiagram,
}: {
  active: string;
  onSelect: (id: string) => void;
  onCreateDiagram: () => void;
}) {
  const [foldersOpen, setFoldersOpen] = useState(true);

  return (
    <aside className="hidden md:flex w-[264px] shrink-0 flex-col gap-6 border-r border-od-border-soft bg-od-surface-muted px-4 py-5 backdrop-blur-sm">
      <button className="flex items-center gap-3 rounded-[8px] bg-od-surface px-3 py-2.5 text-left transition hover:bg-white">
        <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-od-ink text-od-on-dark">
          <span className="text-[15px]">OD</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-od-ink">OpenDiagram</p>
          <p className="truncate text-[12px] text-od-ink-faint">Workspace</p>
        </div>
        <ChevronDown className="h-4 w-4 text-od-ink-faint" />
      </button>

      <button
        type="button"
        onClick={onCreateDiagram}
        className="flex items-center justify-center gap-2 rounded-[999px] bg-od-ink px-6 py-3 text-[14px] text-od-on-dark transition hover:bg-[#2a2a2a] active:translate-y-px"
      >
        <Plus className="h-4 w-4" />
        New diagram
      </button>

      <nav className="flex flex-col gap-0.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-3 rounded-[8px] px-3 py-2 text-[14px] transition ${
                isActive
                  ? "bg-od-surface text-od-ink"
                  : "text-od-ink-muted hover:bg-od-surface-muted"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        <button
          onClick={() => setFoldersOpen((v) => !v)}
          className="mb-1 flex items-center justify-between px-3 py-1 text-[12px] uppercase tracking-wide text-od-ink-faint"
        >
          Projects
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${foldersOpen ? "" : "-rotate-90"}`}
          />
        </button>
        {foldersOpen && (
          <div className="rounded-[12px] border border-[#d9d9d9] bg-white px-3 py-4 text-[13px] leading-[1.6] text-od-ink-faint">
            Connected projects will appear here.
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-od-border-soft pt-4">
        <div className="grid h-9 w-9 place-items-center rounded-full border border-white bg-od-ink text-[13px] text-od-on-dark">
          OD
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-od-ink">Account</p>
          <p className="flex items-center gap-1.5 truncate text-[12px] text-od-ink-faint">
            <span className="inline-block h-2 w-2 rounded-full bg-od-green" />
            Ready
          </p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-full text-od-ink-faint transition hover:bg-od-surface-muted">
          <Settings className="h-[18px] w-[18px]" />
        </button>
      </div>
    </aside>
  );
}
