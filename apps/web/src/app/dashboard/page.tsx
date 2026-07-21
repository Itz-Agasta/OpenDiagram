"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  LogIn,
  LogOut,
  Pencil,
  PenTool,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { GithubLogoIcon } from "@phosphor-icons/react";
import { env } from "@OpenDiagram/env/web";
import { authClient } from "@/lib/auth-client";
import {
  createGuestProjectDraft,
  listGuestProjectDrafts,
  saveGuestProjectDraft,
  type GuestProjectDraft,
} from "@/lib/guest-drafts";
import {
  createProject,
  createProjectFile,
  listProjectFiles,
  listProjects,
  updateProject,
  updateProjectFile,
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
import { toast } from "sonner";

type FileKind = "diagram" | "doc";

type ProjectFile = {
  key: string;
  projectId: string;
  fileId: string | null;
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

type AgentInputSubmit = {
  prompt: string;
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

function AgentInputPanelSkeleton() {
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center px-0 py-6 md:px-6 md:py-8">
      <Skeleton className="mb-4 h-8 w-full max-w-[520px] md:mb-5" />
      <div className="w-full max-w-[680px] overflow-hidden rounded-[20px] border border-black/10 bg-white shadow-[0_14px_28px_-24px_rgba(0,0,0,0.7)] md:rounded-[24px]">
        <div className="px-4 pb-4 pt-4 md:px-5">
          <div className="flex gap-2 overflow-hidden pb-1">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-[96px] shrink-0 rounded-[10px]" />
            ))}
          </div>
          <Skeleton className="mt-4 h-6 w-full max-w-[420px]" />
          <Skeleton className="mt-3 h-6 w-full max-w-[260px]" />
          <div className="mt-6 flex items-center justify-end">
            <Skeleton className="h-7 w-36 rounded-[10px]" />
          </div>
        </div>
      </div>
    </section>
  );
}

const agentModes = [
  { label: "Canvas", icon: PenTool, kind: "diagram" as const },
  { label: "Doc", icon: FileText, kind: "doc" as const },
];

const agentCtas = [
  "Describe it, watch it draw itself.",
  "Your repo has a story, let it vibe out a diagram.",
  "Type a vibe, get an architecture.",
  "Skip the whiteboard, vibe the diagram instead.",
  "Diagrams, vibed into existence.",
];

const presetTags = [
  "Netflix system design",
  "WhatsApp architecture",
  "Uber backend architecture",
  "Twitter architecture",
  "YouTube system design",
  "Slack architecture",
  "Amazon shopping flow",
  "Spotify streaming architecture",
];

function AgentInputPanel({
  creating,
  onSubmit,
}: {
  creating: boolean;
  onSubmit: (input: AgentInputSubmit) => void;
}) {
  const [selectedMode, setSelectedMode] = useState<FileKind>(agentModes[0]?.kind ?? "diagram");
  const [prompt, setPrompt] = useState("");
  const [ctaIndex, setCtaIndex] = useState(0);

  useEffect(() => {
    setCtaIndex(Math.floor(Math.random() * agentCtas.length));
  }, []);

  function submitPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || creating) return;
    onSubmit({ prompt: text, kind: selectedMode });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center px-0 py-4 md:px-6 md:py-5">
      <p className="mb-3 max-w-[680px] px-2 text-center text-[20px] font-serif italic leading-tight text-od-ink md:mb-4 md:text-[24px]">
        {agentCtas[ctaIndex]}
      </p>
      <form
        onSubmit={submitPrompt}
        className="w-full max-w-[680px] overflow-hidden rounded-[20px] border border-black/10 bg-white shadow-[0_14px_28px_-24px_rgba(0,0,0,0.7)] md:rounded-[24px]"
      >
        <div className="rounded-t-[20px] border-t border-black/5 px-4 pb-4 pt-4 md:rounded-t-[24px] md:px-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {agentModes.map(({ label, icon: Icon, kind }) => (
              <button
                key={label}
                type="button"
                aria-pressed={selectedMode === kind}
                disabled={creating}
                onClick={() => setSelectedMode(kind)}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-black/10 bg-white px-3 text-[13px] font-semibold text-[#151515] transition hover:bg-black/[0.03] aria-pressed:border-black/20 aria-pressed:bg-black/[0.04] md:text-[14px]"
              >
                <Icon className="h-4 w-4 text-black/55" />
                {label}
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="sr-only">Describe what OpenDiagram should create</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={creating}
              placeholder="Make a system design for a collaborative AI workspace"
              className="min-h-[48px] w-full resize-none border-0 bg-transparent px-1 text-[15px] leading-[1.35] text-[#242424] outline-none placeholder:text-black/45 disabled:cursor-wait disabled:opacity-70 md:min-h-[56px] md:text-[17px]"
            />
          </label>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="inline-flex min-w-0 items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold text-[#9ca3af]">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="truncate">Picasso</span>
            </div>
            <button
              type="submit"
              disabled={creating || prompt.trim().length === 0}
              className="h-9 rounded-[10px] bg-od-ink px-4 text-[13px] font-semibold text-white transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function PresetTagRow({
  creating,
  onSubmit,
}: {
  creating: boolean;
  onSubmit: (input: AgentInputSubmit) => void;
}) {
  const [tags, setTags] = useState(() => presetTags.slice(0, 4));

  useEffect(() => {
    setTags([...presetTags].sort(() => Math.random() - 0.5).slice(0, 4));
  }, []);

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          disabled={creating}
          onClick={() => onSubmit({ prompt: tag, kind: "diagram" })}
          className="inline-flex h-7 shrink-0 items-center rounded-full border border-od-border-soft bg-od-surface-elevated px-3 text-[12px] font-medium text-od-ink-muted transition hover:border-od-ink/20 hover:text-od-ink disabled:cursor-wait disabled:opacity-40"
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const [guestDrafts, setGuestDrafts] = useState<GuestProjectDraft[]>([]);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [fileModalProjectId, setFileModalProjectId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileKind, setFileKind] = useState<FileKind>("diagram");
  const [projectPending, setProjectPending] = useState(false);
  const [agentCreatePending, setAgentCreatePending] = useState(false);
  const [savedProjectsLoading, setSavedProjectsLoading] = useState(false);
  const [savedProjectsLoaded, setSavedProjectsLoaded] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [filesByProject, setFilesByProject] = useState<Record<string, SavedProjectFile[]>>({});
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingFileKey, setEditingFileKey] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const skipCommitRef = useRef(false);
  const expandInitRef = useRef(false);

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

      try {
        const projects = await listProjects();
        if (!active) return;
        setSavedProjects(projects);

        // Load each project's files so real names show and can be renamed +
        // created from the dashboard.
        const entries = await Promise.all(
          projects.map(async (project) => {
            try {
              return [project.id, await listProjectFiles(project.id)] as const;
            } catch {
              return [project.id, []] as const;
            }
          }),
        );
        if (active) {
          setFilesByProject(Object.fromEntries(entries));
        }
      } catch (err) {
        if (active) {
          toast.error(
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

    return sourceProjects.map((project, index) => {
      const realFiles = isSignedIn ? (filesByProject[project.id] ?? []) : [];
      const files: ProjectFile[] =
        realFiles.length > 0
          ? realFiles.map((file) => ({
              key: file.id,
              projectId: project.id,
              fileId: file.id,
              name: file.name,
              kind: file.type === "diagram" ? "diagram" : "doc",
            }))
          : [
              {
                key: project.id,
                projectId: project.id,
                fileId: null,
                name: "Your first design",
                kind: "diagram",
              },
            ];

      return {
        id: project.id,
        name: project.name,
        initials: getInitials(project.name),
        color: getProjectColor(project.name),
        active: index === 0,
        source: isSignedIn ? "saved" : "guest",
        files,
      };
    });
  }, [filesByProject, guestDrafts, isSignedIn, savedProjects]);

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return projects;

    return projects.filter((project) => project.name.toLowerCase().includes(query));
  }, [projectSearch, projects]);

  // Open the first project by default; after that, expansion is user-controlled.
  useEffect(() => {
    if (expandInitRef.current || projects.length === 0) return;
    expandInitRef.current = true;
    setExpandedProjectId(projects[0].id);
  }, [projects]);

  const selectedProject = projects.find((project) => project.id === fileModalProjectId);
  const projectsLoading =
    session.isPending || (isSignedIn && !savedProjectsLoaded) || savedProjectsLoading;

  function openProjectModal() {
    setProjectName("");
    setProjectModalOpen(true);
  }

  async function signOut() {
    setSignOutPending(true);

    try {
      await authClient.signOut();
      setSavedProjects([]);
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

    try {
      if (user) {
        const project = await createProject({ name });
        let file = null;
        try {
          file = await createProjectFile(project.id, {
            name: "Your first design",
            type: "diagram",
          });
        } catch (fileErr) {
          fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${project.id}`, {
            method: "DELETE",
            credentials: "include",
          }).catch(() => {});
          throw fileErr;
        }
        setSavedProjects((currentProjects) => [project, ...currentProjects]);
        setProjectModalOpen(false);
        setProjectName("");
        if (file) {
          router.push(`/project/${project.id}/workspace/${file.id}`);
        } else {
          router.push(`/project/${project.id}/workspace`);
        }
        return;
      }

      if (guestDrafts.length >= 1) {
        toast.error("You can try one project as a guest. Log in to save it and create more.");
        return;
      }

      const draft = createGuestProjectDraft(name);
      saveGuestProjectDraft(draft);
      setGuestDrafts((currentDrafts) => [draft, ...currentDrafts]);
      setProjectModalOpen(false);
      setProjectName("");
      router.push(`/project/${draft.id}/workspace`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setProjectPending(false);
    }
  }

  async function createProjectFromAgent({ prompt, kind }: AgentInputSubmit) {
    if (agentCreatePending) return;

    const { projectName: nextProjectName, fileName: nextFileName } = deriveAgentProjectNames(
      prompt,
      kind,
    );
    const firstMessage = { id: crypto.randomUUID(), role: "user" as const, text: prompt };
    const docContent = kind === "doc" ? `# ${nextFileName}\n\n${prompt}\n` : undefined;

    setAgentCreatePending(true);

    try {
      if (user) {
        const project = await createProject({
          name: nextProjectName,
          description: prompt,
        });

        let file: SavedProjectFile | null = null;
        try {
          file = await createProjectFile(project.id, {
            name: nextFileName,
            type: kind === "diagram" ? "diagram" : "doc",
            content: docContent,
            history: [firstMessage],
          });
        } catch (fileErr) {
          fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${project.id}`, {
            method: "DELETE",
            credentials: "include",
          }).catch(() => {});
          throw fileErr;
        }

        setSavedProjects((currentProjects) => [project, ...currentProjects]);
        setFilesByProject((current) => ({
          ...current,
          [project.id]: file ? [file] : [],
        }));
        router.push(`/project/${project.id}/workspace/${file.id}`);
        return;
      }

      if (guestDrafts.length >= 1) {
        toast.error("You can try one project as a guest. Log in to save it and create more.");
        return;
      }

      const draft = createGuestProjectDraft(nextProjectName, nextFileName, kind, docContent, [
        firstMessage,
      ]);
      saveGuestProjectDraft(draft);
      setGuestDrafts((currentDrafts) => [draft, ...currentDrafts]);
      router.push(`/project/${draft.id}/workspace/${draft.files[0]?.id ?? ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setAgentCreatePending(false);
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
    const name = fileName.trim();
    if (!project || !name) return;

    if (project.source === "guest") {
      setFileModalProjectId(null);
      toast.error("Log in to save your project before adding files.");
      return;
    }

    setProjectPending(true);

    try {
      const file = await createProjectFile(project.id, {
        name,
        type: fileKind === "diagram" ? "diagram" : "doc",
      });
      setFilesByProject((current) => ({
        ...current,
        [project.id]: [...(current[project.id] ?? []), file],
      }));
      setExpandedProjectId(project.id);
      setFileModalProjectId(null);
      setFileName("");

      router.push(`/project/${project.id}/workspace/${file.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create file.");
    } finally {
      setProjectPending(false);
    }
  }

  function openFile(file: Pick<ProjectFile, "projectId" | "fileId" | "kind">) {
    const fileId = file.fileId ?? "";
    router.push(`/project/${file.projectId}/workspace/${fileId}`);
  }

  function toggleExpand(id: string) {
    setExpandedProjectId((current) => (current === id ? null : id));
  }

  function beginEditProject(project: Project) {
    setEditingFileKey(null);
    setEditingProjectId(project.id);
    setNameDraft(project.name);
  }

  function beginEditFile(file: ProjectFile) {
    setEditingProjectId(null);
    setEditingFileKey(file.key);
    setNameDraft(file.name);
  }

  function cancelEdit() {
    skipCommitRef.current = true;
    setEditingProjectId(null);
    setEditingFileKey(null);
  }

  async function commitProject(project: Project) {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setEditingProjectId(null);
      return;
    }
    setEditingProjectId(null);

    const name = nameDraft.trim();
    if (!name || name === project.name) return;

    try {
      if (project.source === "saved") {
        const updated = await updateProject(project.id, { name });
        setSavedProjects((current) =>
          current.map((p) => (p.id === project.id ? { ...p, name: updated.name } : p)),
        );
      } else {
        const target = guestDrafts.find((entry) => entry.id === project.id);
        if (target) {
          const next = { ...target, name };
          saveGuestProjectDraft(next);
          setGuestDrafts((current) => current.map((d) => (d.id === project.id ? next : d)));
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename project.");
    }
  }

  async function commitFile(file: ProjectFile) {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setEditingFileKey(null);
      return;
    }
    setEditingFileKey(null);

    const name = nameDraft.trim();
    const fileId = file.fileId;
    if (!name || !fileId || name === file.name) return;

    try {
      const updated = await updateProjectFile(file.projectId, fileId, { name });
      setFilesByProject((current) => ({
        ...current,
        [file.projectId]: (current[file.projectId] ?? []).map((entry) =>
          entry.id === fileId ? { ...entry, name: updated.name } : entry,
        ),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename file.");
    }
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
                    <DropdownMenuItem asChild className="cursor-pointer text-od-ink">
                      <Link href="/login">
                        <LogIn className="h-4 w-4" />
                        Log in
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="px-3 py-3">
            <label className="flex h-9 items-center gap-2 rounded-full border border-od-border-soft bg-od-surface-elevated px-3 text-[13px] text-od-ink-faint focus-within:border-od-ink">
              <Search className="h-4 w-4" />
              <span className="sr-only">Search projects</span>
              <input
                type="search"
                placeholder="Search"
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
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
              ) : filteredProjects.length === 0 ? (
                <p className="px-2 py-2 text-[13px] text-od-ink-faint">No projects found.</p>
              ) : (
                filteredProjects.map((project) => (
                  <div key={project.id} className="mb-1">
                    <div
                      className={`group/prow flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-[14px] transition ${
                        project.active
                          ? "bg-od-canvas/70 text-od-ink"
                          : "text-od-ink-muted hover:bg-od-canvas/45"
                      }`}
                    >
                      <span
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] text-[10px] font-semibold text-white"
                        style={{ backgroundColor: project.color }}
                      >
                        {project.initials}
                      </span>
                      {editingProjectId === project.id ? (
                        <input
                          autoFocus
                          value={nameDraft}
                          onChange={(event) => setNameDraft(event.target.value)}
                          onBlur={() => void commitProject(project)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                            else if (event.key === "Escape") cancelEdit();
                          }}
                          className="min-w-0 flex-1 rounded-[5px] border border-od-border-soft bg-white px-1.5 py-0.5 text-[13px] text-od-ink outline-none focus:border-od-ink"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const fileId = project.files[0]?.fileId ?? "";
                              router.push(`/project/${project.id}/workspace/${fileId}`);
                            }}
                            className="min-w-0 flex-1 cursor-pointer truncate text-left"
                          >
                            {project.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => beginEditProject(project)}
                            aria-label="Rename project"
                            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-od-ink-faint opacity-0 transition hover:bg-od-canvas/60 hover:text-od-ink group-hover/prow:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleExpand(project.id)}
                            aria-label={expandedProjectId === project.id ? "Collapse" : "Expand"}
                            aria-expanded={expandedProjectId === project.id}
                            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${
                                expandedProjectId === project.id ? "" : "-rotate-90"
                              }`}
                            />
                          </button>
                        </>
                      )}
                    </div>

                    {expandedProjectId === project.id && (
                      <div className="mt-1 grid gap-0.5 pl-5">
                        {project.files.map((file) => {
                          const Icon = getFileIcon(file.kind);

                          return (
                            <div
                              key={file.key}
                              className="group/file flex h-7 items-center gap-2 rounded-[7px] px-2 text-[12px] text-od-ink-muted transition hover:bg-od-canvas/45 hover:text-od-ink"
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0 text-od-ink-faint" />
                              {editingFileKey === file.key ? (
                                <input
                                  autoFocus
                                  value={nameDraft}
                                  onChange={(event) => setNameDraft(event.target.value)}
                                  onBlur={() => void commitFile(file)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                    else if (event.key === "Escape") cancelEdit();
                                  }}
                                  className="min-w-0 flex-1 rounded-[5px] border border-od-border-soft bg-white px-1.5 py-0.5 text-[12px] text-od-ink outline-none focus:border-od-ink"
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openFile(file)}
                                    className="min-w-0 flex-1 cursor-pointer truncate text-left"
                                  >
                                    {file.name}
                                  </button>
                                  {file.fileId && (
                                    <button
                                      type="button"
                                      onClick={() => beginEditFile(file)}
                                      aria-label="Rename file"
                                      className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-[5px] text-od-ink-faint opacity-0 transition hover:bg-od-canvas/60 hover:text-od-ink group-hover/file:opacity-100"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => openFileModal(project.id)}
                          className="flex h-7 items-center gap-2 rounded-[7px] px-2 text-left text-[12px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 truncate">New file</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-od-surface">
          <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-od-border-soft bg-od-surface px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                aria-label="OpenDiagram home"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-od-ink text-[12px] font-semibold text-od-on-dark lg:hidden"
              >
                OD
              </Link>
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 truncate text-[18px] font-semibold leading-tight md:text-[20px]">
                  <span className="hidden h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-od-ink text-[10px] font-semibold text-od-on-dark lg:grid">
                    OD
                  </span>
                  OpenDiagram
                </h1>
              </div>
            </div>
          </header>

          <div className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 flex-col gap-4 overflow-hidden bg-od-surface p-4 md:p-8">
            {projectsLoading ? (
              <AgentInputPanelSkeleton />
            ) : (
              <>
                <AgentInputPanel
                  creating={agentCreatePending}
                  onSubmit={(input) => void createProjectFromAgent(input)}
                />
                <PresetTagRow
                  creating={agentCreatePending}
                  onSubmit={(input) => void createProjectFromAgent(input)}
                />
                <div className="mt-8 flex flex-col items-center gap-4">
                  <div className="flex items-center gap-3">
                    <span className="h-px w-16 bg-od-border-soft" />
                    <span className="text-[12px] font-medium uppercase tracking-wider text-od-ink-faint">
                      Or
                    </span>
                    <span className="h-px w-16 bg-od-border-soft" />
                  </div>
                  <Link
                    href="/import/github"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-od-border-soft bg-white px-5 py-2.5 text-[14px] font-semibold text-od-ink shadow-sm transition hover:bg-od-surface-elevated"
                  >
                    <GithubLogoIcon size={16} weight="regular" />
                    Import your project from GitHub
                  </Link>
                </div>
              </>
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

function deriveAgentProjectNames(prompt: string, kind: FileKind) {
  const fallback = kind === "doc" ? "Architecture Notes" : "Architecture Diagram";
  const cleaned = prompt
    .replace(/[`*_#[\](){}<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const significantWords = cleaned
    .split(" ")
    .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter(Boolean)
    .filter((word) => !agentNameStopWords.has(word.toLowerCase()))
    .slice(0, 5);

  const base = titleCase(significantWords.join(" ")) || fallback;
  const projectName = clampName(base, fallback);
  const fileSuffix = kind === "doc" ? "Doc" : "Canvas";
  const fileName = clampName(`${projectName} ${fileSuffix}`, fallback);

  return { projectName, fileName };
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function clampName(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const characters = Array.from(trimmed);
  if (characters.length <= 64) return trimmed;

  return characters.slice(0, 61).join("").trimEnd() + "...";
}

const agentNameStopWords = new Set([
  "a",
  "an",
  "and",
  "architecture",
  "create",
  "design",
  "diagram",
  "doc",
  "document",
  "for",
  "generate",
  "make",
  "of",
  "system",
  "the",
  "with",
]);

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
