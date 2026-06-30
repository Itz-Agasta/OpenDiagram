// TODO: Saswata refine this dashboard with proper design, filters, search, empty state art
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, LayoutGrid, FileCode2 } from "lucide-react";
import { nanoid } from "nanoid";

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

  function createProject() {
    const name = newName.trim() || "Untitled Project";
    const id = nanoid(10);
    setProjects((prev) => [{ id, name, updatedAt: new Date() }, ...prev]);
    setCreating(false);
    setNewName("");
    router.push(`/workspace/${id}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode2 className="size-5 text-primary" />
          <span className="font-semibold text-lg tracking-tight">OpenDiagram</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="size-4" />
          New Project
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-6">Projects</h1>

        {/* Create modal */}
        {creating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-card rounded-xl border border-border p-6 w-full max-w-sm shadow-xl">
              <h2 className="text-lg font-semibold mb-4">New Project</h2>
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring mb-4"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setCreating(false)}
                  className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createProject}
                  className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center text-muted-foreground">
            <LayoutGrid className="size-12 mb-4 opacity-30" />
            <p className="text-lg font-medium mb-1">No projects yet</p>
            <p className="text-sm mb-6">Create your first diagram to get started</p>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="size-4" />
              New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/workspace/${project.id}`)}
                className="text-left rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <FileCode2 className="size-5 text-muted-foreground" />
                </div>
                <p className="font-medium text-sm mb-1 truncate">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  {project.updatedAt.toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
