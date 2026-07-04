"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  LogIn,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  Settings,
} from "lucide-react";
import { AIChatPanel } from "./AIChatPanel";
import { Whiteboard } from "./Whiteboard";
import { Diamond } from "@/components/loading-ui/diamond";
import { MorphingInfinity } from "@/components/loading-ui/morphing-infinity";
import { SquareSnake } from "@/components/loading-ui/square-snake";
import { TextDots } from "@/components/loading-ui/text-dots";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteGuestProjectDraft,
  getGuestProjectDraft,
  saveGuestProjectDraft,
  type GuestProjectDraft,
} from "@/lib/guest-drafts";
import {
  createProject,
  createProjectFile,
  getProject,
  getProjectFile,
  getRepoGenerationJob,
  listProjectFiles,
  startRepoGeneration,
  updateProjectFile,
  type RepoGenerationJob,
  type SavedProjectFile,
  type SavedProject,
} from "@/lib/projects-client";
import { applyDiagramToCanvas } from "@/lib/excalidraw-utils";
import { useWorkspaceLayoutStore, type WorkspaceSidebarFile } from "@/lib/workspace-layout-store";

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 360;
const AGENT_MIN_WIDTH = 300;
const AGENT_MAX_WIDTH = 560;
const CONTENT_MIN_WIDTH = 420;

const MilkdownDocEditor = dynamic(
  () => import("./MilkdownDocEditor").then((mod) => mod.MilkdownDocEditor),
  {
    loading: () => (
      <div className="grid h-full place-items-center bg-white text-[14px] text-od-ink-muted">
        Loading markdown editor...
      </div>
    ),
    ssr: false,
  },
);

function sanitizeSceneAppState(appState: unknown) {
  if (!appState || typeof appState !== "object") return appState;

  const { collaborators: _collaborators, ...rest } = appState as Record<string, unknown>;

  return rest;
}

function fileContentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (content == null) return "";

  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return "";
  }
}

function getFileIcon(type: SavedProjectFile["type"] | "diagram") {
  return type === "doc" ? FileText : PenTool;
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "OD";
}

function toSidebarFile(file: Pick<SavedProjectFile, "id" | "name" | "type">): WorkspaceSidebarFile {
  return { id: file.id, name: file.name, type: file.type };
}

function RepoGenerationProgress({
  error,
  job,
}: {
  error: string | null;
  job: RepoGenerationJob | null;
}) {
  if (!job && !error) return null;

  const activeTask = job?.tasks.find((task) => task.status === "active");
  const loaderIndex = job ? job.tasks.findIndex((task) => task.status === "active") : 0;
  const Loader = [Diamond, MorphingInfinity, SquareSnake][Math.max(loaderIndex, 0) % 3] ?? Diamond;

  return (
    <div className="mb-4 rounded-[12px] border border-od-border-soft bg-white p-3 shadow-[0_12px_36px_-28px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2">
        {job?.status === "done" ? (
          <span className="grid size-5 place-items-center rounded-full bg-od-green/10 text-[11px] font-semibold text-od-green">
            ✓
          </span>
        ) : error || job?.status === "failed" ? (
          <span className="grid size-5 place-items-center rounded-full bg-red-50 text-[11px] font-semibold text-red-600">
            !
          </span>
        ) : (
          <Loader className="size-5 text-od-ink" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-od-ink">
            {error ?? job?.message ?? "Generating repository files"}
          </p>
          {job && job.status !== "done" && job.status !== "failed" && (
            <p className="text-[11px] text-od-ink-faint">
              {activeTask?.message ?? "Preparing agents"}
              <TextDots />
            </p>
          )}
        </div>
      </div>

      {job?.tasks.length ? (
        <div className="mt-3 grid gap-1.5">
          {job.tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 text-[11px] text-od-ink-muted">
              <span
                className={`size-1.5 rounded-full ${
                  task.status === "complete"
                    ? "bg-od-green"
                    : task.status === "active"
                      ? "bg-od-ink"
                      : task.status === "failed"
                        ? "bg-red-500"
                        : "bg-od-border-soft"
                }`}
              />
              <span className="min-w-0 flex-1 truncate">{task.name}</span>
              <span className="shrink-0 text-od-ink-faint">{task.status}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceLayout() {
  const params = useParams<{ projectId: string; workspaceId?: string }>();
  const router = useRouter();
  const session = authClient.useSession();
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [draft, setDraft] = useState<GuestProjectDraft | null>(null);
  const [projectRow, setProjectRow] = useState<SavedProject | null>(null);
  const [activeFile, setActiveFile] = useState<SavedProjectFile | null>(null);
  const [initialScene, setInitialScene] = useState<unknown>(null);
  const [docContent, setDocContent] = useState("");
  const [repoGenerationJob, setRepoGenerationJob] = useState<RepoGenerationJob | null>(null);
  const [repoGenerationError, setRepoGenerationError] = useState<string | null>(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [showFirstFileDialog, setShowFirstFileDialog] = useState(false);
  const [firstFileName, setFirstFileName] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const draftRef = useRef<GuestProjectDraft | null>(null);
  const sceneRef = useRef<unknown>(null);
  const contentRef = useRef<string>("");
  const currentFileIdRef = useRef<string | null>(null);
  const startedRepoGenerationRef = useRef<string | null>(null);
  const sidebarWidth = useWorkspaceLayoutStore((state) => state.sidebarWidth);
  const agentWidth = useWorkspaceLayoutStore((state) => state.agentWidth);
  const isAgentOpen = useWorkspaceLayoutStore((state) => state.isAgentOpen);
  const storedProjectId = useWorkspaceLayoutStore((state) => state.projectId);
  const projectName = useWorkspaceLayoutStore((state) => state.projectName);
  const sidebarFiles = useWorkspaceLayoutStore((state) => state.files);
  const activeFileId = useWorkspaceLayoutStore((state) => state.activeFileId);
  const setSidebarWidth = useWorkspaceLayoutStore((state) => state.setSidebarWidth);
  const setAgentWidth = useWorkspaceLayoutStore((state) => state.setAgentWidth);
  const openAgent = useWorkspaceLayoutStore((state) => state.openAgent);
  const closeAgent = useWorkspaceLayoutStore((state) => state.closeAgent);
  const setProjectSnapshot = useWorkspaceLayoutStore((state) => state.setProjectSnapshot);
  const setStoredActiveFileId = useWorkspaceLayoutStore((state) => state.setActiveFileId);
  const upsertStoredFile = useWorkspaceLayoutStore((state) => state.upsertFile);
  const resizeRef = useRef<{
    pane: "sidebar" | "agent";
    startX: number;
    startWidth: number;
  } | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const agentWidthRef = useRef(agentWidth);
  sidebarWidthRef.current = sidebarWidth;
  agentWidthRef.current = agentWidth;
  const welcomeSceneRef = useRef(false);

  async function loadWelcomeScene(api: ExcalidrawImperativeAPI) {
    const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
    const elements = convertToExcalidrawElements([
      {
        type: "text",
        text: "Create your first vibe diagram today",
        x: 180,
        y: 180,
        fontSize: 28,
        textAlign: "center",
        strokeColor: "#888",
      },
      {
        type: "text",
        text: "Try our agent Picasso",
        x: 290,
        y: 225,
        fontSize: 18,
        textAlign: "center",
        strokeColor: "#aaa",
      },
    ]);
    api.updateScene({ elements });
  }

  useEffect(() => {
    const nextDraft = getGuestProjectDraft(params.projectId);
    draftRef.current = nextDraft;
    setDraft(nextDraft);

    if (nextDraft) {
      setProjectRow(null);
      const file = params.workspaceId
        ? nextDraft.files.find((f) => f.id === params.workspaceId)
        : nextDraft.files[0];
      currentFileIdRef.current = file?.id ?? nextDraft.files[0]?.id ?? null;
      setActiveFile(null);
      setProjectSnapshot({
        projectId: nextDraft.id,
        projectName: nextDraft.name,
        files: nextDraft.files.map((draftFile) => ({
          id: draftFile.id,
          name: draftFile.name,
          type: "diagram",
        })),
        activeFileId: currentFileIdRef.current,
      });
      setDocContent("");
      contentRef.current = "";
      setInitialScene(file?.scene ?? null);
    } else {
      currentFileIdRef.current = null;
      setInitialScene(null);
    }
  }, [params.projectId, params.workspaceId, setProjectSnapshot]);

  useEffect(() => {
    if (!draft || session.data?.user) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draft, session.data?.user]);

  useEffect(() => {
    if (session.isPending || !session.data?.user || draftRef.current) return;

    let active = true;

    async function loadActiveFile() {
      setSaveError(null);

      try {
        const [project, files] = await Promise.all([
          getProject(params.projectId),
          listProjectFiles(params.projectId),
        ]);
        let result: SavedProjectFile;

        if (params.workspaceId) {
          result = await getProjectFile(params.projectId, params.workspaceId);
        } else {
          const firstFile = files[0];

          if (!firstFile) {
            if (active) {
              setProjectRow(project);
              setProjectSnapshot({
                projectId: project.id,
                projectName: project.name,
                files: [],
                activeFileId: null,
              });
              setShowFirstFileDialog(true);
              setFirstFileName("");
            }
            return;
          }

          result = await getProjectFile(params.projectId, firstFile.id);
        }

        if (active) {
          setProjectRow(project);
          setActiveFile(result);
          setProjectSnapshot({
            projectId: project.id,
            projectName: project.name,
            files: files.map(toSidebarFile),
            activeFileId: result.id,
          });
          currentFileIdRef.current = result.id;
          sceneRef.current = result.type === "diagram" ? (result.scene ?? null) : null;
          contentRef.current = result.type === "doc" ? fileContentToText(result.content) : "";
          setDocContent(contentRef.current);
          setInitialScene(result.type === "diagram" ? (result.scene ?? null) : null);
        }
      } catch (err) {
        if (active) {
          setSaveError(err instanceof Error ? err.message : "Could not load project file.");
        }
      }
    }

    void loadActiveFile();

    return () => {
      active = false;
    };
  }, [
    draft,
    params.projectId,
    params.workspaceId,
    session.data?.user,
    session.isPending,
    setProjectSnapshot,
  ]);

  const saveDraftAfterLogin = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;

    if (!session.data?.user) {
      setLeavePromptOpen(true);
      return;
    }

    setSavePending(true);
    setSaveError(null);

    try {
      const currentFile =
        currentDraft.files.find((f) => f.id === currentFileIdRef.current) ?? currentDraft.files[0];
      if (!currentFile) {
        setSaveError("No file to save.");
        return;
      }

      const project = await createProject({
        name: currentDraft.name,
        description: currentDraft.description,
      });
      const file = await createProjectFile(project.id, {
        name: currentFile.name,
        type: "diagram",
        scene: currentFile.scene,
        spec: currentFile.spec,
      });

      deleteGuestProjectDraft(currentDraft.id);
      draftRef.current = null;
      setDraft(null);
      router.replace(`/project/${project.id}/workspace/${file.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save project.");
    } finally {
      setSavePending(false);
    }
  }, [router, session.data?.user]);

  useEffect(() => {
    if (!draft || !session.data?.user || savePending) return;

    void saveDraftAfterLogin();
  }, [draft, saveDraftAfterLogin, savePending, session.data?.user]);

  useEffect(() => {
    if (!session.data?.user || draft || projectRow?.source !== "github_import") return;
    if (startedRepoGenerationRef.current === projectRow.id) return;

    const importedProject = projectRow;
    let cancelled = false;
    startedRepoGenerationRef.current = importedProject.id;
    setRepoGenerationError(null);

    async function syncSidebarFiles() {
      const files = await listProjectFiles(importedProject.id);
      setProjectSnapshot({
        projectId: importedProject.id,
        projectName: importedProject.name,
        files: files.map(toSidebarFile),
        activeFileId: currentFileIdRef.current,
      });
    }

    async function pollJob(jobId: string) {
      while (!cancelled) {
        const job = await getRepoGenerationJob(importedProject.id, jobId);
        if (cancelled) return;
        setRepoGenerationJob(job);
        if (job.createdFiles.length > 0) await syncSidebarFiles().catch(() => undefined);
        if (job.status === "done" || job.status === "failed") return;
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    }

    async function start() {
      try {
        const job = await startRepoGeneration(importedProject.id);
        if (cancelled) return;
        setRepoGenerationJob(job);
        if (job.createdFiles.length > 0) await syncSidebarFiles().catch(() => undefined);
        if (job.status !== "done" && job.status !== "failed") await pollJob(job.id);
      } catch (err) {
        if (cancelled) return;
        setRepoGenerationError(
          err instanceof Error ? err.message : "Could not start repository generation.",
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
    };
  }, [draft, projectRow, session.data?.user, setProjectSnapshot]);

  const updateGuestDraft = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      const scene = { elements, appState: sanitizeSceneAppState(appState), files };

      sceneRef.current = scene;

      const currentDraft = draftRef.current;
      if (!currentDraft || session.data?.user) return;

      const fileId = currentFileIdRef.current ?? currentDraft.files[0]?.id;
      if (!fileId) return;

      const nextDraft = {
        ...currentDraft,
        files: currentDraft.files.map((f) => (f.id === fileId ? { ...f, scene } : f)),
      };

      draftRef.current = nextDraft;
      saveGuestProjectDraft(nextDraft);
    },
    [session.data?.user],
  );

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    setExcalidrawAPI((currentAPI) => (currentAPI === api ? currentAPI : api));
  }, []);

  useEffect(() => {
    if (!excalidrawAPI) return;

    if (!initialScene || typeof initialScene !== "object") {
      if (!welcomeSceneRef.current) {
        welcomeSceneRef.current = true;
        loadWelcomeScene(excalidrawAPI);
      }
      return;
    }

    welcomeSceneRef.current = false;
    const scene = initialScene as {
      elements?: unknown;
      appState?: unknown;
      files?: unknown;
      rawElements?: unknown;
      skeletons?: unknown;
    };

    if (Array.isArray(scene.skeletons)) {
      void applyDiagramToCanvas(
        excalidrawAPI,
        scene.skeletons as never[],
        Array.isArray(scene.rawElements) ? scene.rawElements : [],
      );
      return;
    }

    const appState = sanitizeSceneAppState(scene.appState);

    excalidrawAPI.updateScene({
      elements: Array.isArray(scene.elements) ? scene.elements : [],
      appState: appState && typeof appState === "object" ? appState : undefined,
    });

    if (scene.files && typeof scene.files === "object") {
      excalidrawAPI.addFiles(Object.values(scene.files));
    }
  }, [excalidrawAPI, initialScene]);

  async function saveActiveFile() {
    if (!session.data?.user) {
      await saveDraftAfterLogin();
      return;
    }

    if (!activeFile) {
      setSaveError("Project file is still loading.");
      return;
    }

    setSavePending(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const file = await updateProjectFile(params.projectId, activeFile.id, {
        content: activeFile.type === "doc" ? contentRef.current : undefined,
        scene: activeFile.type === "diagram" ? sceneRef.current : undefined,
      });

      setActiveFile(file);
      upsertStoredFile(toSidebarFile(file));
      if (file.type === "doc") {
        contentRef.current = fileContentToText(file.content);
        setDocContent(contentRef.current);
      }
      setSaveMessage("Saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save canvas.");
    } finally {
      setSavePending(false);
    }
  }

  async function handleCreateFirstFile(event: React.FormEvent) {
    event.preventDefault();
    const name = firstFileName.trim() || "Untitled diagram";

    try {
      const file = await createProjectFile(params.projectId, {
        name,
        type: "diagram",
      });
      setShowFirstFileDialog(false);
      setActiveFile(file);
      setProjectSnapshot({
        projectId: params.projectId,
        projectName,
        files: [toSidebarFile(file)],
        activeFileId: file.id,
      });
      currentFileIdRef.current = file.id;
      sceneRef.current = null;
      setInitialScene(null);
      router.replace(`/project/${params.projectId}/workspace/${file.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not create file.");
    }
  }

  async function signInToSave() {
    await authClient.signIn.social({
      provider: "github",
      scopes: ["repo"],
      callbackURL: window.location.href,
    });
  }

  async function signOut() {
    await authClient.signOut();
    router.refresh();
  }

  function openWorkspaceFile(fileId: string) {
    setStoredActiveFileId(fileId);
    router.push(`/project/${params.projectId}/workspace/${fileId}`);
  }

  const clampSidebarWidth = useCallback((width: number, agent = agentWidthRef.current) => {
    const maxByViewport = Math.max(
      SIDEBAR_MIN_WIDTH,
      window.innerWidth - agent - CONTENT_MIN_WIDTH,
    );

    return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), Math.min(SIDEBAR_MAX_WIDTH, maxByViewport));
  }, []);

  const clampAgentWidth = useCallback((width: number, sidebar = sidebarWidthRef.current) => {
    const maxByViewport = Math.max(
      AGENT_MIN_WIDTH,
      window.innerWidth - sidebar - CONTENT_MIN_WIDTH,
    );

    return Math.min(Math.max(width, AGENT_MIN_WIDTH), Math.min(AGENT_MAX_WIDTH, maxByViewport));
  }, []);

  useEffect(() => {
    function clampPanesToViewport() {
      // Prevent re-triggering resize if values are the same
      const newSidebarWidth = clampSidebarWidth(sidebarWidthRef.current);
      const newAgentWidth = clampAgentWidth(agentWidthRef.current);

      if (newSidebarWidth !== sidebarWidthRef.current || newAgentWidth !== agentWidthRef.current) {
        setSidebarWidth(newSidebarWidth);
        setAgentWidth(newAgentWidth);
      }
    }

    window.addEventListener("resize", clampPanesToViewport);

    return () => window.removeEventListener("resize", clampPanesToViewport);
  }, [clampAgentWidth, clampSidebarWidth]);

  const handleResizeStart = useCallback(
    (pane: "sidebar" | "agent", e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = {
        pane,
        startX: e.clientX,
        startWidth: pane === "sidebar" ? sidebarWidthRef.current : agentWidthRef.current,
      };

      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;

        if (resizeRef.current.pane === "sidebar") {
          const dx = ev.clientX - resizeRef.current.startX;
          const newWidth = clampSidebarWidth(resizeRef.current.startWidth + dx);
          if (newWidth !== sidebarWidthRef.current) {
            setSidebarWidth(newWidth);
          }
          return;
        }

        const dx = resizeRef.current.startX - ev.clientX;
        const newWidth = clampAgentWidth(resizeRef.current.startWidth + dx);
        if (newWidth !== agentWidthRef.current) {
          setAgentWidth(newWidth);
        }
      };

      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [clampAgentWidth, clampSidebarWidth],
  );

  const accountName = session.data?.user?.name || session.data?.user?.email || "Guest workspace";
  const accountImage = session.data?.user?.image;
  const hasCurrentProjectSnapshot = storedProjectId === params.projectId;
  const sidebarProjectName = hasCurrentProjectSnapshot ? projectName : "OpenDiagram";
  const sidebarFilesForProject = hasCurrentProjectSnapshot ? sidebarFiles : [];
  const activeFileName =
    activeFile?.name ??
    sidebarFilesForProject.find((file) => file.id === activeFileId)?.name ??
    "Untitled file";

  return (
    <div className="flex h-full w-full overflow-hidden bg-od-surface text-od-ink">
      <aside
        className="group/sidebar relative hidden h-full shrink-0 flex-col border-r border-od-border-soft bg-od-surface lg:flex"
        style={{ width: sidebarWidth }}
      >
        <div
          className="absolute inset-y-0 -right-[3px] z-20 w-[6px] cursor-col-resize opacity-0 transition-opacity group-hover/sidebar:opacity-100"
          onMouseDown={(event) => handleResizeStart("sidebar", event)}
        >
          <div className="mx-auto h-full w-px bg-od-border-soft" />
        </div>

        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-od-border-soft px-3">
          <Link
            href="/dashboard"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-od-border-soft text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {accountImage ? (
            <img
              src={accountImage}
              alt=""
              className="h-8 w-8 rounded-[8px] border border-od-border-soft object-cover"
            />
          ) : (
            <div className="grid h-8 w-8 place-items-center rounded-[8px] bg-od-ink text-[12px] font-semibold text-od-on-dark">
              {getInitials(accountName)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{accountName}</p>
            <p className="truncate text-[11px] text-od-ink-faint">
              {session.data?.user ? "Signed in" : "Guest session"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account actions"
                className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
              >
                <Settings className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuGroup>
                {session.data?.user ? (
                  <DropdownMenuItem onSelect={() => void signOut()} className="cursor-pointer">
                    <LogOut className="h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => void signInToSave()} className="cursor-pointer">
                    <LogIn className="h-4 w-4" />
                    Sign in
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
          <div className="mb-3 min-w-0">
            <p className="truncate text-[12px] font-medium uppercase tracking-[0.14em] text-od-ink-faint">
              Explorer
            </p>
            <p className="mt-1 truncate text-[14px] font-semibold text-od-ink">
              {sidebarProjectName}
            </p>
          </div>

          <RepoGenerationProgress error={repoGenerationError} job={repoGenerationJob} />

          <div className="min-h-0 overflow-y-auto pb-4">
            {sidebarFilesForProject.length === 0 ? (
              <p className="rounded-[8px] px-2 py-2 text-[13px] text-od-ink-faint">No files yet</p>
            ) : (
              <div className="grid gap-0.5">
                {sidebarFilesForProject.map((file) => {
                  const Icon = getFileIcon(file.type);
                  const active = file.id === activeFileId;

                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => openWorkspaceFile(file.id)}
                      className={`flex h-8 items-center gap-2 rounded-[8px] px-2 text-left text-[13px] transition ${
                        active
                          ? "bg-od-canvas/75 text-od-ink"
                          : "text-od-ink-muted hover:bg-od-canvas/45 hover:text-od-ink"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-od-ink-faint" />
                      <span className="min-w-0 truncate">{file.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-od-border-soft bg-white px-4">
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-[0.16em] text-od-ink-faint">
              {sidebarProjectName}
            </p>
            <h1 className="truncate text-[15px] font-semibold text-od-ink">{activeFileName}</h1>
          </div>
          {(draft || session.data?.user) && (
            <div className="flex shrink-0 items-center gap-3">
              {!isAgentOpen && (
                <button
                  type="button"
                  onClick={openAgent}
                  className="grid h-8 w-8 place-items-center rounded-[8px] border border-od-border-soft text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
                  aria-label="Open agent panel"
                >
                  <PanelRightOpen className="h-4 w-4" />
                </button>
              )}
              {saveMessage && (
                <p className="hidden text-[12px] text-od-green sm:block">{saveMessage}</p>
              )}
              {saveError && (
                <p className="hidden max-w-[260px] truncate text-[12px] text-red-600 sm:block">
                  {saveError}
                </p>
              )}
              <button
                type="button"
                onClick={saveActiveFile}
                disabled={savePending}
                className="h-8 rounded-[8px] bg-od-ink px-3 text-[12px] font-medium text-white disabled:cursor-wait disabled:opacity-70"
              >
                {savePending ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeFile?.type === "doc" ? (
            <div className="flex h-full flex-col bg-white">
              <MilkdownDocEditor
                key={activeFile.id}
                value={docContent}
                onChange={(value) => {
                  contentRef.current = value;
                  setDocContent(value);
                }}
              />
            </div>
          ) : (
            <Whiteboard
              initialScene={initialScene}
              onAPIReady={handleExcalidrawAPI}
              onSceneChange={updateGuestDraft}
            />
          )}
        </div>
      </main>

      {isAgentOpen && (
        <aside
          className="group/agent relative hidden h-full shrink-0 flex-col border-l border-od-border-soft bg-white lg:flex"
          style={{ width: agentWidth }}
        >
          <div
            className="absolute inset-y-0 -left-[3px] z-20 w-[6px] cursor-col-resize opacity-0 transition-opacity group-hover/agent:opacity-100"
            onMouseDown={(event) => handleResizeStart("agent", event)}
          >
            <div className="mx-auto h-full w-px bg-od-border-soft" />
          </div>
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-od-border-soft px-3">
            <p className="truncate text-[13px] font-medium text-od-ink">Agent</p>
            <button
              type="button"
              onClick={closeAgent}
              className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
              aria-label="Close agent panel"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
          <AIChatPanel
            excalidrawAPI={activeFile?.type === "doc" ? null : excalidrawAPI}
            projectId={session.data?.user ? params.projectId : undefined}
            fileId={activeFile?.id ?? currentFileIdRef.current ?? undefined}
            initialHistory={
              activeFile?.history as
                | { id: string; role: "user" | "assistant"; text: string }[]
                | undefined
            }
          />
        </aside>
      )}
      {showFirstFileDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 px-4">
          <div className="w-full max-w-[420px] rounded-[18px] border border-od-border-soft bg-white p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.55)]">
            <h2 className="text-[18px] font-semibold text-od-ink">Name your file</h2>
            <form onSubmit={handleCreateFirstFile} className="mt-4 grid gap-4">
              <input
                autoFocus
                value={firstFileName}
                onChange={(event) => setFirstFileName(event.target.value)}
                placeholder="e.g. Checkout architecture"
                className="h-11 rounded-[8px] border border-od-border-soft px-3 text-[14px] text-od-ink outline-none transition placeholder:text-od-ink-faint focus:border-od-ink"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowFirstFileDialog(false);
                    router.push("/dashboard");
                  }}
                  className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink"
                >
                  Go to dashboard
                </button>
                <button
                  type="submit"
                  className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-white"
                >
                  Create file
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {leavePromptOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 px-4">
          <div className="w-full max-w-[420px] rounded-[18px] border border-od-border-soft bg-white p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.55)]">
            <h2 className="text-[18px] font-semibold text-od-ink">You&apos;ll lose your work</h2>
            <p className="mt-2 text-[14px] leading-6 text-od-ink-muted">
              Sign in to save this guest draft to your workspace before leaving.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLeavePromptOpen(false)}
                className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={signInToSave}
                className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-white"
              >
                Login / Sign up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
