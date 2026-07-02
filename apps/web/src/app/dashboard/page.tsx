"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  FileText,
  Import,
  PenTool,
  Plus,
  Search,
  Settings,
} from "lucide-react";

type FileKind = "diagram" | "doc";

type ProjectFile = {
  id: string;
  name: string;
  kind: FileKind;
};

type Project = {
  id: string;
  name: string;
  initials: string;
  color: string;
  active: boolean;
  files: ProjectFile[];
};

type RecentFile = {
  id: string;
  fileId: string;
  title: string;
  type: string;
  description: string;
  project: string;
  updated: string;
  status: string;
  kind: FileKind;
};

const initialProjects: Project[] = [
  {
    id: "atlas-cloud",
    name: "Atlas Cloud",
    initials: "AC",
    color: "#0CB300",
    active: true,
    files: [
      { id: "checkout-architecture", name: "Checkout architecture", kind: "diagram" },
      { id: "service-topology", name: "Service topology", kind: "diagram" },
      { id: "auth-boundary-map", name: "Auth boundary map", kind: "diagram" },
      { id: "gateway-readme", name: "Gateway README", kind: "doc" },
      { id: "platform-runbook", name: "Platform runbook", kind: "doc" },
      { id: "api-conventions", name: "API conventions", kind: "doc" },
    ],
  },
  {
    id: "gateway-api",
    name: "Gateway API",
    initials: "GA",
    color: "#3B82F6",
    active: false,
    files: [
      { id: "request-lifecycle", name: "Request lifecycle", kind: "diagram" },
      { id: "rate-limit-flow", name: "Rate limit flow", kind: "diagram" },
      { id: "gateway-readme", name: "Gateway README", kind: "doc" },
      { id: "public-api-guide", name: "Public API guide", kind: "doc" },
      { id: "error-contract", name: "Error contract", kind: "doc" },
    ],
  },
  {
    id: "billing-core",
    name: "Billing Core",
    initials: "BC",
    color: "#F97316",
    active: false,
    files: [
      { id: "billing-architecture", name: "Billing architecture", kind: "diagram" },
      { id: "event-processing-flow", name: "Event processing flow", kind: "diagram" },
      { id: "ledger-model", name: "Ledger model", kind: "diagram" },
      { id: "billing-runbook", name: "Billing runbook", kind: "doc" },
      { id: "reconciliation-notes", name: "Reconciliation notes", kind: "doc" },
    ],
  },
];

const initialRecentFiles: RecentFile[] = [
  {
    id: "recent-checkout-architecture",
    fileId: "checkout-architecture",
    title: "Checkout architecture",
    type: "Diagram file",
    description: "Excalidraw canvas for service boundaries and dependencies",
    project: "Atlas Cloud",
    updated: "Edited 12m ago",
    status: "Live draft",
    kind: "diagram",
  },
  {
    id: "recent-gateway-readme",
    fileId: "gateway-readme",
    title: "Gateway README",
    type: "Doc file",
    description: "Repository README for setup, conventions, and ownership",
    project: "Gateway API",
    updated: "Edited yesterday",
    status: "Synced",
    kind: "doc",
  },
  {
    id: "recent-billing-architecture",
    fileId: "billing-architecture",
    title: "Billing architecture",
    type: "Diagram file",
    description: "Excalidraw canvas for event flow and core services",
    project: "Billing Core",
    updated: "Edited Tue",
    status: "Review",
    kind: "diagram",
  },
  {
    id: "recent-platform-runbook",
    fileId: "platform-runbook",
    title: "Platform runbook",
    type: "Doc file",
    description: "Operational doc for deploys, alerts, and recovery steps",
    project: "Atlas Cloud",
    updated: "Edited Mon",
    status: "Draft",
    kind: "doc",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(initialRecentFiles);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [fileModalProjectId, setFileModalProjectId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileKind, setFileKind] = useState<FileKind>("diagram");

  const selectedProject = projects.find((project) => project.id === fileModalProjectId);

  function openProjectModal() {
    setProjectName("");
    setProjectModalOpen(true);
  }

  function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = projectName.trim();
    if (!name) return;

    setProjects((currentProjects) => [
      {
        id: nanoid(10),
        name,
        initials: getInitials(name),
        color: getProjectColor(name),
        active: true,
        files: [],
      },
      ...currentProjects.map((project) => ({ ...project, active: false })),
    ]);
    setProjectModalOpen(false);
    setProjectName("");
  }

  function openFileModal(projectId: string) {
    setFileModalProjectId(projectId);
    setFileName("");
    setFileKind("diagram");
  }

  function createFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const project = selectedProject;
    const name = fileName.trim();
    if (!project || !name) return;

    const file: ProjectFile = {
      id: nanoid(10),
      name,
      kind: fileKind,
    };

    setProjects((currentProjects) =>
      currentProjects.map((currentProject) =>
        currentProject.id === project.id
          ? { ...currentProject, files: [...currentProject.files, file] }
          : currentProject,
      ),
    );
    setRecentFiles((currentFiles) => [
      {
        id: nanoid(10),
        fileId: file.id,
        title: name,
        type: fileKind === "diagram" ? "Diagram file" : "Doc file",
        description:
          fileKind === "diagram"
            ? "Excalidraw canvas for architecture work"
            : "Project documentation for implementation notes",
        project: project.name,
        updated: "Created just now",
        status: "Draft",
        kind: fileKind,
      },
      ...currentFiles,
    ]);
    setFileModalProjectId(null);
    setFileName("");
  }

  function openFile(file: Pick<ProjectFile, "id" | "kind">) {
    if (file.kind !== "diagram") return;

    router.push(`/workspace/${file.id}`);
  }

  return (
    <main className="h-dvh overflow-hidden bg-od-surface text-od-ink">
      <div className="flex h-full w-full overflow-hidden">
        <aside className="hidden h-full w-[288px] shrink-0 border-r border-od-border-soft bg-od-surface text-od-ink lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-od-border-soft px-4">
            <Link
              href="/"
              className="grid h-9 w-9 place-items-center rounded-[8px] bg-od-ink text-[13px] font-semibold text-od-on-dark"
            >
              OD
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">OpenDiagram</p>
              <p className="truncate text-[12px] text-od-ink-faint">Architecture workspace</p>
            </div>
            <button
              type="button"
              aria-label="Workspace settings"
              className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          <div className="px-3 py-3">
            <label className="flex h-9 items-center gap-2 rounded-full border border-od-border-soft bg-od-surface-elevated px-3 text-[13px] text-od-ink-faint focus-within:border-od-ink">
              <Search className="h-4 w-4" />
              <span className="sr-only">Search workspace</span>
              <input
                type="search"
                placeholder="Search"
                className="w-full bg-transparent text-od-ink outline-none placeholder:text-od-ink-faint"
              />
            </label>
          </div>

          <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
            <button
              type="button"
              className="mb-2 flex items-center justify-between rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-od-ink-faint"
            >
              Projects
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            <div className="min-h-0 overflow-y-auto pb-4">
              {projects.map((project) => (
                <div key={project.id} className="group/project mb-2">
                  <button
                    type="button"
                    className={`group flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left text-[14px] transition ${
                      project.active
                        ? "bg-od-canvas/70 text-od-ink"
                        : "text-od-ink-muted hover:bg-od-canvas/45"
                    }`}
                  >
                    <span
                      className="grid h-5 w-5 place-items-center rounded-[5px] text-[10px] font-semibold text-white"
                      style={{ backgroundColor: project.color }}
                    >
                      {project.initials}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-od-ink-faint" />
                  </button>

                  <div className="mt-1 grid gap-0.5 pl-5">
                    {project.files.map(({ id, name, kind }) => {
                      const Icon = getFileIcon(kind);

                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => openFile({ id, kind })}
                          className={`flex h-7 items-center gap-2 rounded-[7px] px-2 text-left text-[12px] text-od-ink-muted transition hover:bg-od-canvas/45 hover:text-od-ink ${
                            kind === "diagram" ? "cursor-pointer" : "cursor-default"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 text-od-ink-faint" />
                          <span className="min-w-0 truncate">{name}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => openFileModal(project.id)}
                      className="flex h-7 items-center gap-2 rounded-[7px] px-2 text-left text-[12px] text-od-ink-faint opacity-0 transition hover:bg-od-canvas/45 hover:text-od-ink group-hover/project:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">New file</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-od-border-soft p-3">
            <button
              type="button"
              onClick={openProjectModal}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-od-ink text-[14px] font-medium text-od-on-dark transition hover:bg-[#2a2a2a] active:translate-y-px"
            >
              <Plus className="h-4 w-4" />
              New project
            </button>
          </div>
        </aside>

        <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-od-surface">
          <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-od-border-soft bg-od-surface px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-od-ink text-[13px] font-semibold text-od-on-dark lg:hidden">
                OD
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] text-od-ink-faint">Personal workspace</p>
                <h1 className="truncate text-[18px] font-semibold leading-tight md:text-[20px]">
                  Dashboard
                </h1>
              </div>
            </div>

            <div className="hidden h-9 min-w-[280px] items-center gap-2 rounded-full border border-od-border-soft bg-od-surface px-3 text-[13px] text-od-ink-faint md:flex">
              <Search className="h-4 w-4" />
              Search projects and files
            </div>
          </header>

          <div className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 flex-col gap-4 overflow-hidden bg-od-surface p-4 md:p-8">
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={openProjectModal}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-od-ink px-5 text-[14px] font-medium text-od-on-dark transition hover:bg-[#2a2a2a] active:translate-y-px"
              >
                <Plus className="h-4 w-4" />
                New project
              </button>
              <Link
                href="/import/github"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-od-surface px-5 text-[14px] font-medium text-od-ink ring-1 ring-od-border-soft transition hover:bg-white active:translate-y-px"
              >
                <Import className="h-4 w-4" />
                Import project
              </Link>
            </div>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-od-border-soft bg-od-surface">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-od-border-soft p-4 md:p-5">
                <div>
                  <h2 className="text-[18px] font-semibold">Recent files</h2>
                  <p className="mt-1 text-[13px] text-od-ink-faint">
                    Diagram files and doc files across projects.
                  </p>
                </div>
                <button
                  type="button"
                  className="hidden h-9 items-center gap-2 rounded-[8px] border border-od-border-soft px-3 text-[13px] font-medium transition hover:bg-od-surface-elevated sm:flex"
                >
                  View all
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="divide-y divide-od-border-soft">
                  {recentFiles.map(
                    ({ id, fileId, title, type, description, project, updated, status, kind }) => {
                      const Icon = getFileIcon(kind);

                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => openFile({ id: fileId, kind })}
                          className={`group grid w-full grid-cols-[auto_1fr] gap-3 p-4 text-left transition hover:bg-od-surface-elevated md:grid-cols-[auto_1fr_150px_100px] md:items-center md:p-5 ${
                            kind === "diagram" ? "cursor-pointer" : "cursor-default"
                          }`}
                        >
                          <span className="grid h-10 w-10 place-items-center rounded-[8px] border border-od-border-soft bg-od-surface-elevated text-od-ink transition group-hover:scale-105">
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] font-medium">{title}</span>
                            <span className="mt-1 block truncate text-[13px] text-od-ink-faint">
                              {type} · {project} · {description}
                            </span>
                          </span>
                          <span className="col-start-2 text-[13px] text-od-ink-faint md:col-start-auto">
                            {updated}
                          </span>
                          <span className="col-start-2 inline-flex w-fit rounded-[8px] border border-od-border-soft px-2.5 py-1 text-[12px] text-od-ink-muted md:col-start-auto">
                            {status}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>

      {projectModalOpen && (
        <Modal title="New project" onClose={() => setProjectModalOpen(false)}>
          <form onSubmit={createProject} className="grid gap-4">
            <label className="grid gap-2 text-[13px] font-medium text-od-ink-muted">
              Project name
              <input
                autoFocus
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. Payments Platform"
                className="h-11 rounded-[8px] border border-od-border-soft px-3 text-[14px] text-od-ink outline-none transition placeholder:text-od-ink-faint focus:border-od-ink"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProjectModalOpen(false)}
                className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink transition hover:bg-od-surface-elevated"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-od-on-dark transition hover:bg-[#2a2a2a]"
              >
                Create project
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selectedProject && (
        <Modal
          title={`New file in ${selectedProject.name}`}
          onClose={() => setFileModalProjectId(null)}
        >
          <form onSubmit={createFile} className="grid gap-4">
            <label className="grid gap-2 text-[13px] font-medium text-od-ink-muted">
              File name
              <input
                autoFocus
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                placeholder="e.g. Checkout architecture"
                className="h-11 rounded-[8px] border border-od-border-soft px-3 text-[14px] text-od-ink outline-none transition placeholder:text-od-ink-faint focus:border-od-ink"
              />
            </label>

            <div className="grid gap-2">
              <p className="text-[13px] font-medium text-od-ink-muted">File type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={fileKind === "diagram"}
                  onClick={() => setFileKind("diagram")}
                  className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-od-border-soft text-[14px] font-medium text-od-ink transition hover:bg-od-surface-elevated aria-pressed:border-od-ink aria-pressed:bg-od-ink aria-pressed:text-od-on-dark"
                >
                  <PenTool className="h-4 w-4" />
                  Canvas
                </button>
                <button
                  type="button"
                  aria-pressed={fileKind === "doc"}
                  onClick={() => setFileKind("doc")}
                  className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-od-border-soft text-[14px] font-medium text-od-ink transition hover:bg-od-surface-elevated aria-pressed:border-od-ink aria-pressed:bg-od-ink aria-pressed:text-od-on-dark"
                >
                  <FileText className="h-4 w-4" />
                  Doc
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFileModalProjectId(null)}
                className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink transition hover:bg-od-surface-elevated"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-od-on-dark transition hover:bg-[#2a2a2a]"
              >
                Create file
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4">
      <div className="w-full max-w-[440px] rounded-[16px] border border-od-border-soft bg-od-surface p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.55)]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function getFileIcon(kind: FileKind) {
  return kind === "diagram" ? PenTool : FileText;
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "PR";
}

const projectColors = [
  "#0CB300",
  "#3B82F6",
  "#F97316",
  "#A855F7",
  "#EF4444",
  "#14B8A6",
  "#EAB308",
  "#6366F1",
];

function getProjectColor(name: string) {
  let hash = 0;

  for (const char of name) {
    hash = (hash + char.charCodeAt(0)) % projectColors.length;
  }

  return projectColors[hash];
}
