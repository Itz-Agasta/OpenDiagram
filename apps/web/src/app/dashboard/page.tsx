// TODO: Saswata refine this dashboard with proper design, filters, search, empty state art
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, LayoutGrid, FileCode2 } from "lucide-react";
import { nanoid } from "nanoid";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";

interface Project {
  id: string;
  name: string;
  updatedAt: Date;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [nav, setNav] = useState("home");

  function createProject() {
    const name = newName.trim() || "Untitled Project";
    const id = nanoid(10);
    setProjects((prev) => [{ id, name, updatedAt: new Date() }, ...prev]);
    setCreating(false);
    setNewName("");
    router.push(`/workspace/${id}`);
  }

  return (
    <div className="flex h-screen bg-background">
      <SidebarNav active={nav} onSelect={setNav} onCreateDiagram={() => setCreating(true)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <FileCode2 className="size-5 text-primary" />
            <span className="text-lg font-semibold tracking-tight">OpenDiagram</span>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" />
            New Project
          </button>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-6 py-10">
          <h1 className="mb-6 text-2xl font-bold">Projects</h1>

          {/* Create modal */}
          {creating && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
                <h2 className="mb-4 text-lg font-semibold">New Project</h2>
                <input
                  autoFocus
                  type="text"
                  placeholder="Project name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createProject();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setCreating(false)}
                    className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createProject}
                    className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center text-muted-foreground">
              <LayoutGrid className="mb-4 size-12 opacity-30" />
              <p className="mb-1 text-lg font-medium">No projects yet</p>
              <p className="mb-6 text-sm">Create your first diagram to get started</p>
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="size-4" />
                New Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => router.push(`/workspace/${project.id}`)}
                  className="rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <FileCode2 className="size-5 text-muted-foreground" />
                  </div>
                  <p className="mb-1 truncate text-sm font-medium">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {project.updatedAt.toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
