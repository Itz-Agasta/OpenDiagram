"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  FileText,
  Import,
  LogIn,
  LogOut,
  PenTool,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { env } from "@OpenDiagram/env/web";
import { authClient } from "@/lib/auth-client";
import {
  createGuestProjectDraft,
  getGuestProjectDraft,
  listGuestProjectDrafts,
  saveGuestProjectDraft,
  type GuestProjectDraft,
  type GuestDraftFile,
} from "@/lib/guest-drafts";
import {
  createProject,
  createProjectFile,
  listProjectFiles,
  listProjects,
  type SavedProject,
  type SavedProjectFile,
} from "@/lib/projects-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

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
  source: "guest" | "saved";
};

type RecentFile = {
  id: string;
  fileId: string;
  projectId: string;
  title: string;
  type: string;
  description: string;
  project: string;
  updated: string;
  status: string;
  kind: FileKind;
};

function SidebarProjectSkeletons() {
  return (
    <div className="flex flex-col gap-3 px-2 py-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-[5px]" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

function RecentFilesSkeleton() {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-od-border-soft bg-od-surface">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-od-border-soft p-4 md:p-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="hidden h-9 w-20 rounded-[8px] sm:block" />
      </div>

      <div className="divide-y divide-od-border-soft">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[auto_1fr] gap-3 p-4 md:grid-cols-[auto_1fr_150px_100px] md:items-center md:p-5"
          >
            <Skeleton className="size-10 rounded-[8px]" />
            <span className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full max-w-[360px]" />
            </span>
            <Skeleton className="col-start-2 h-4 w-20 md:col-start-auto" />
            <Skeleton className="col-start-2 h-7 w-16 rounded-[8px] md:col-start-auto" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const [guestDrafts, setGuestDrafts] = useState<GuestProjectDraft[]>([]);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectFilesByProjectId, setProjectFilesByProjectId] = useState<
    Record<string, SavedProjectFile[]>
  >({});
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [fileModalProjectId, setFileModalProjectId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileKind, setFileKind] = useState<FileKind>("diagram");
  const [projectPending, setProjectPending] = useState(false);
  const [savedProjectsLoading, setSavedProjectsLoading] = useState(false);
  const [savedProjectsLoaded, setSavedProjectsLoaded] = useState(false);
  const [firstFileName, setFirstFileName] = useState("Your first design");
  const [firstFileKind, setFirstFileKind] = useState<FileKind>("diagram");
  const [signOutPending, setSignOutPending] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  const user = session.data?.user;
  const isSignedIn = Boolean(user);
  const accountName = user?.name || user?.email || "OpenDiagram";
  const accountImage = user?.image;

  useEffect(() => {
    setGuestDrafts(listGuestProjectDrafts());
  }, []);

  useEffect(() => {
    if (session.isPending || !user) return;

    let active = true;

    async function loadSavedProjects() {
      setSavedProjectsLoading(true);
      setSavedProjectsLoaded(false);
      setProjectError(null);

      try {
        const projects = await listProjects();
        const filesByProjectId = Object.fromEntries(
          await Promise.all(
            projects.map(async (project) => [project.id, await listProjectFiles(project.id)]),
          ),
        );
        if (active) {
          setSavedProjects(projects);
          setProjectFilesByProjectId(filesByProjectId);
        }
      } catch (err) {
        if (active) {
          setProjectError(
            err instanceof Error && err.message !== "Internal Server Error"
              ? err.message
              : "Could not load saved projects.",
          );
        }
      } finally {
        if (active) {
          setSavedProjectsLoading(false);
          setSavedProjectsLoaded(true);
        }
      }
    }

    void loadSavedProjects();

    return () => {
      active = false;
    };
  }, [session.isPending, user]);

  const projects = useMemo<Project[]>(() => {
    const sourceProjects = isSignedIn ? savedProjects : guestDrafts;

    return sourceProjects.map((project, index) => ({
      id: project.id,
      name: project.name,
      initials: getInitials(project.name),
      color: getProjectColor(project.name),
      active: index === 0,
      source: isSignedIn ? "saved" : "guest",
      files: isSignedIn
        ? (projectFilesByProjectId[project.id] ?? [])
            .filter((file) => file.type === "diagram" || file.type === "doc")
            .map((file) => ({
              id: file.id,
              name: file.name,
              kind: file.type === "doc" ? "doc" : "diagram",
            }))
        : (project as GuestProjectDraft).files.map((file) => ({
            id: file.id,
            name: file.name,
            kind: "diagram" as const,
          })),
    }));
  }, [guestDrafts, isSignedIn, projectFilesByProjectId, savedProjects]);

  const recentFiles = useMemo<RecentFile[]>(
    () =>
      projects.flatMap((project) =>
        project.files.map((file) => ({
          id: `recent-${project.id}-${file.id}`,
          fileId: file.id,
          projectId: project.id,
          title: file.name,
          type: file.kind === "doc" ? "Doc file" : "Diagram file",
          description:
            project.source === "guest"
              ? "Guest draft saved in this browser"
              : "Saved project in your workspace",
          project: project.name,
          updated: project.source === "guest" ? "Local draft" : "Saved",
          status: project.source === "guest" ? "Guest" : "Synced",
          kind: file.kind,
        })),
      ),
    [projects],
  );

  const selectedProject = projects.find((project) => project.id === fileModalProjectId);
  const projectsLoading =
    session.isPending || (isSignedIn && !savedProjectsLoaded) || savedProjectsLoading;

  async function signIn() {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: window.location.href,
    });
  }

  function openProjectModal() {
    setProjectName("");
    setFirstFileName("Your first design");
    setFirstFileKind("diagram");
    setProjectError(null);
    setProjectModalOpen(true);
  }

  async function signOut() {
    setSignOutPending(true);

    try {
      await authClient.signOut();
      setSavedProjects([]);
      setProjectFilesByProjectId({});
      setSavedProjectsLoaded(false);
      router.refresh();
    } finally {
      setSignOutPending(false);
    }
  }

  async function createDashboardProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = projectName.trim();
    if (!name) return;

    setProjectPending(true);
    setProjectError(null);

    try {
      if (user) {
        const project = await createProject({ name });
        let file: Awaited<ReturnType<typeof createProjectFile>>;
        try {
          file = await createProjectFile(project.id, {
            name: firstFileName.trim() || "Untitled",
            type: firstFileKind === "doc" ? "doc" : "diagram",
          });
        } catch (fileErr) {
          fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${project.id}`, {
            method: "DELETE",
            credentials: "include",
          }).catch(() => {});
          throw fileErr;
        }
        setSavedProjects((currentProjects) => [project, ...currentProjects]);
        setProjectFilesByProjectId((currentFiles) => ({
          ...currentFiles,
          [project.id]: [file],
        }));
        setProjectModalOpen(false);
        setProjectName("");
        router.push(`/project/${project.id}/workspace/${file.id}`);
        return;
      }

      const draft = createGuestProjectDraft(name, firstFileName.trim() || "Untitled");
      saveGuestProjectDraft(draft);
      setGuestDrafts((currentDrafts) => [draft, ...currentDrafts]);
      setProjectModalOpen(false);
      setProjectName("");
      router.push(`/project/${draft.id}/workspace`);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setProjectPending(false);
    }
  }

  function openFileModal(projectId: string) {
    setFileModalProjectId(projectId);
    setFileName("");
    setFileKind("diagram");
  }

  async function createFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const project = selectedProject;
    if (!project || !fileName.trim()) return;

    if (fileKind === "diagram") {
      if (project.source === "saved") {
        const file = await createProjectFile(project.id, {
          name: fileName.trim(),
          type: "diagram",
        });
        setProjectFilesByProjectId((currentFiles) => ({
          ...currentFiles,
          [project.id]: [file, ...(currentFiles[project.id] ?? [])],
        }));
        router.push(`/project/${project.id}/workspace/${file.id}`);
      } else {
        const draft = getGuestProjectDraft(project.id);
        if (!draft) return;

        const newFile: GuestDraftFile = { id: crypto.randomUUID(), name: fileName.trim() };
        const nextDraft = { ...draft, files: [...draft.files, newFile] };
        saveGuestProjectDraft(nextDraft);
        setGuestDrafts((currentDrafts) =>
          currentDrafts.map((d) => (d.id === draft.id ? nextDraft : d)),
        );
        router.push(`/project/${project.id}/workspace/${newFile.id}`);
      }
    }

    setFileModalProjectId(null);
    setFileName("");
  }

  function openFile(file: Pick<ProjectFile, "id" | "kind">, projectId: string) {
    if (file.kind !== "diagram") return;

    router.push(`/project/${projectId}/workspace/${file.id}`);
  }

  return (
    <main className="h-dvh overflow-hidden bg-od-surface text-od-ink">
      <div className="flex h-full w-full overflow-hidden">
        <aside className="hidden h-full w-[288px] shrink-0 border-r border-od-border-soft bg-od-surface text-od-ink lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-od-border-soft px-4">
            {accountImage ? (
              <img
                src={accountImage}
                alt=""
                className="h-9 w-9 rounded-[8px] border border-od-border-soft object-cover"
              />
            ) : (
              <Link
                href="/"
                className="grid h-9 w-9 place-items-center rounded-[8px] bg-od-ink text-[13px] font-semibold text-od-on-dark"
              >
                {getInitials(accountName)}
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{accountName}</p>
              <p className="truncate text-[12px] text-od-ink-faint">Default workspace</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Workspace settings"
                  className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuGroup>
                  {isSignedIn ? (
                    <DropdownMenuItem
                      disabled={signOutPending}
                      onSelect={() => void signOut()}
                      className="cursor-pointer text-od-ink"
                    >
                      <LogOut className="h-4 w-4" />
                      {signOutPending ? "Logging out..." : "Log out"}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() => void signIn()}
                      className="cursor-pointer text-od-ink"
                    >
                      <LogIn className="h-4 w-4" />
                      Sign in
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
              {projectsLoading ? (
                <SidebarProjectSkeletons />
              ) : projects.length === 0 ? (
                <button
                  type="button"
                  onClick={openProjectModal}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left text-[13px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Your first project
                </button>
              ) : (
                projects.map((project) => (
                  <div key={project.id} className="group/project mb-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/project/${project.id}/workspace`)}
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
                            onClick={() => openFile({ id, kind }, project.id)}
                            className="flex h-7 cursor-pointer items-center gap-2 rounded-[7px] px-2 text-left text-[12px] text-od-ink-muted transition hover:bg-od-canvas/45 hover:text-od-ink"
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
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-od-surface">
          <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-od-border-soft bg-od-surface px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-od-ink text-[13px] font-semibold text-od-on-dark lg:hidden">
                OD
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[18px] font-semibold leading-tight md:text-[20px]">
                  Dashboard
                </h1>
              </div>
            </div>

            <label className="hidden h-9 min-w-[280px] cursor-text items-center gap-2 rounded-full border border-od-border-soft bg-od-surface px-3 text-[13px] text-od-ink-faint focus-within:border-od-ink md:flex">
              <Search className="h-4 w-4" />
              <span className="sr-only">Search projects and files</span>
              <input
                type="search"
                placeholder="Search projects and files"
                className="min-w-0 flex-1 cursor-text bg-transparent text-od-ink outline-none placeholder:text-od-ink-faint"
              />
            </label>
          </header>

          <div className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 flex-col gap-4 overflow-hidden bg-od-surface p-4 md:p-8">
            {recentFiles.length > 0 && (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={openProjectModal}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-od-ink px-4 text-[13px] font-medium text-od-on-dark transition hover:bg-[#2a2a2a] active:translate-y-px"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate AI diagram
                </button>
                <button
                  type="button"
                  onClick={openProjectModal}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-od-surface px-4 text-[13px] font-medium text-od-ink ring-1 ring-od-border-soft transition hover:bg-white active:translate-y-px"
                >
                  <Plus className="h-4 w-4" />
                  New project
                </button>
                <Link
                  href="/import/github"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-od-surface px-4 text-[13px] font-medium text-od-ink ring-1 ring-od-border-soft transition hover:bg-white active:translate-y-px"
                >
                  <Import className="h-4 w-4" />
                  Import project
                </Link>
              </div>
            )}

            {projectError && (
              <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {projectError}
              </div>
            )}

            {projectsLoading ? (
              <RecentFilesSkeleton />
            ) : recentFiles.length === 0 ? (
              <section className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-12 text-center">
                <h2 className="max-w-[18ch] text-[32px] font-semibold leading-[1.1] -tracking-[0.03em] text-od-ink md:text-[44px]">
                  Start with your first design
                </h2>
                <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.7] text-od-ink-muted">
                  Create locally without signing in, then save it to your workspace when you are
                  ready.
                </p>

                <div className="mt-8 grid w-full max-w-[680px] grid-cols-1 gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={openProjectModal}
                    className="flex min-h-[128px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[14px] border border-od-border-soft bg-white p-5 text-center transition hover:bg-od-surface-elevated"
                  >
                    <Sparkles className="h-7 w-7 text-od-ink" />
                    <span className="text-[14px] font-medium leading-tight text-od-ink">
                      Generate AI diagram
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={openProjectModal}
                    className="flex min-h-[128px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[14px] border border-od-border-soft bg-white p-5 text-center transition hover:bg-od-surface-elevated"
                  >
                    <PenTool className="h-7 w-7 text-od-ink" />
                    <span className="text-[14px] font-medium leading-tight text-od-ink">
                      Blank canvas
                    </span>
                  </button>
                  <Link
                    href="/import/github"
                    className="flex min-h-[128px] flex-col items-center justify-center gap-3 rounded-[14px] border border-od-border-soft bg-white p-5 text-center transition hover:bg-od-surface-elevated"
                  >
                    <Import className="h-7 w-7 text-od-ink" />
                    <span className="text-[14px] font-medium leading-tight text-od-ink">
                      Import from GitHub
                    </span>
                  </Link>
                </div>
              </section>
            ) : (
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
                      ({
                        id,
                        fileId,
                        projectId,
                        title,
                        type,
                        description,
                        project,
                        updated,
                        status,
                        kind,
                      }) => {
                        const Icon = getFileIcon(kind);

                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => openFile({ id: fileId, kind }, projectId)}
                            className="group grid w-full cursor-pointer grid-cols-[auto_1fr] gap-3 p-4 text-left transition hover:bg-od-surface-elevated md:grid-cols-[auto_1fr_150px_100px] md:items-center md:p-5"
                          >
                            <span className="grid h-10 w-10 place-items-center rounded-[8px] border border-od-border-soft bg-od-surface-elevated text-od-ink transition group-hover:scale-105">
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[15px] font-medium">
                                {title}
                              </span>
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
            )}
          </div>
        </section>
      </div>

      {projectModalOpen && (
        <Modal title="New project" onClose={() => setProjectModalOpen(false)}>
          <form onSubmit={createDashboardProject} className="grid gap-4">
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

            <label className="grid gap-2 text-[13px] font-medium text-od-ink-muted">
              File name
              <input
                value={firstFileName}
                onChange={(event) => setFirstFileName(event.target.value)}
                placeholder="e.g. Checkout architecture"
                className="h-11 rounded-[8px] border border-od-border-soft px-3 text-[14px] text-od-ink outline-none transition placeholder:text-od-ink-faint focus:border-od-ink"
              />
            </label>

            <div className="grid gap-2">
              <p className="text-[13px] font-medium text-od-ink-muted">File type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={firstFileKind === "diagram"}
                  onClick={() => setFirstFileKind("diagram")}
                  className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-od-border-soft text-[14px] font-medium text-od-ink transition hover:bg-od-surface-elevated aria-pressed:border-od-ink aria-pressed:bg-od-ink aria-pressed:text-od-on-dark"
                >
                  <PenTool className="h-4 w-4" />
                  Canvas
                </button>
                <button
                  type="button"
                  aria-pressed={firstFileKind === "doc"}
                  onClick={() => setFirstFileKind("doc")}
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
                onClick={() => setProjectModalOpen(false)}
                className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink transition hover:bg-od-surface-elevated"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={projectPending}
                className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-od-on-dark transition hover:bg-[#2a2a2a] disabled:cursor-wait disabled:opacity-70"
              >
                {projectPending ? "Creating..." : "Create project"}
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
