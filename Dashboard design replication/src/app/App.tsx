import { useState } from "react";
import { Plus, FolderPlus, Upload } from "lucide-react";
import { SidebarNav } from "./components/sidebar-nav";
import { Topbar } from "./components/topbar";
import { FileCard, FileRow } from "./components/file-card";
import { files } from "./components/data";

const actions = [
  { id: "new", label: "Create new diagram", icon: Plus },
  { id: "connect", label: "Connect a project", icon: FolderPlus },
  { id: "import", label: "Import a file", icon: Upload },
];

export default function App() {
  const [nav, setNav] = useState("home");
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--od-canvas)] text-[var(--od-ink)]">
      <SidebarNav active={nav} onSelect={setNav} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar view={view} onViewChange={setView} />

        <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-10">
            {/* Action tiles */}
            <section className="grid grid-cols-3 gap-3 sm:max-w-[540px]">
              {actions.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className="flex aspect-square flex-col items-center justify-center gap-3 rounded-[16px] border border-[var(--od-border-soft)] bg-[var(--od-surface-elevated)] p-4 text-center backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--od-ink)] text-[var(--od-on-dark)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[14px] leading-tight text-[var(--od-ink)]">{label}</span>
                </button>
              ))}
            </section>

            {/* File list */}
            <section className="flex flex-col gap-5">
              <h2 className="text-[20px] text-[var(--od-ink)]">Files</h2>
              {view === "grid" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {files.map((f) => (
                    <FileCard key={f.id} file={f} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {files.map((f) => (
                    <FileRow key={f.id} file={f} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
