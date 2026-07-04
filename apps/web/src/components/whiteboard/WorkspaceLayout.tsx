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
import { env } from "@OpenDiagram/env/web";
import { AIChatPanel } from "./AIChatPanel";
import { Whiteboard } from "./Whiteboard";
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

const AUTOSAVE_DELAY_MS = 800;

type SaveStatus = "idle" | "saving" | "saved" | "error";

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

function sceneElementsVersion(elements: readonly unknown[]) {
  let version = 0;
  for (const element of elements) {
    if (element && typeof element === "object" && "version" in element) {
      const value = (element as { version?: unknown }).version;
      if (typeof value === "number") version += value;
    }
  }
  return version;
}

function initialElementsVersion(scene: unknown) {
  const elements = (scene as { elements?: unknown })?.elements;
  return Array.isArray(elements) ? sceneElementsVersion(elements) : 0;
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
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const draftRef = useRef<GuestProjectDraft | null>(null);
  const sceneRef = useRef<unknown>(null);
  const contentRef = useRef<string>("");
  const currentFileIdRef = useRef<string | null>(null);
  const startedRepoGenerationRef = useRef<string | null>(null);
  const activeFileRef = useRef<SavedProjectFile | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const promotionStartedRef = useRef(false);
  const lastSavedVersionRef = useRef(0);
  const pendingVersionRef = useRef(0);
  const skipCommitRef = useRef(false);

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

  const isSignedIn = Boolean(session.data?.user);
  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

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

  // Load guest draft or initial state
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
      lastSavedVersionRef.current = initialElementsVersion(file?.scene);
    } else {
      currentFileIdRef.current = null;
      setInitialScene(null);
    }
  }, [params.projectId, params.workspaceId, setProjectSnapshot]);

  // Guest hard-exit guard (tab close / refresh)
  useEffect(() => {
    if (!draft || isSignedIn) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draft, isSignedIn]);

  // Guest in-app back-navigation guard
  useEffect(() => {
    if (!draft || isSignedIn) return;

    window.history.pushState(null, "", window.location.href);

    function onPopState() {
      window.history.pushState(null, "", window.location.href);
      setLeavePromptOpen(true);
    }

    window.addEventListener("popstate", onPopState);

    return () => window.removeEventListener("popstate", onPopState);
  }, [draft, isSignedIn]);

  // Load database project file
  useEffect(() => {
    if (session.isPending || !isSignedIn || draftRef.current) return;

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
          lastSavedVersionRef.current = initialElementsVersion(
            result.type === "diagram" ? (result.scene ?? null) : null,
          );
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
    isSignedIn,
    session.isPending,
    setProjectSnapshot,
  ]);

  const saveDraftAfterLogin = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (!currentDraft || !session.data?.user) return;

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

  // Promote guest draft on login
  useEffect(() => {
    if (!draft || !session.data?.user || savePending || promotionStartedRef.current) return;

    promotionStartedRef.current = true;
    void saveDraftAfterLogin();
  }, [draft, saveDraftAfterLogin, savePending, session.data?.user]);

  // Repo generation polling (for imports)
  useEffect(() => {
    if (!session.data?.user || draft || projectRow?.source !== "github_import") return;
    if (projectRow.generationStatus === "done") {
      setRepoGenerationJob(null);
      return;
    }
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
        if (job.status === "done" || job.status === "failed") {
          // Refetch project details to sync database fields in client state
          const updatedProj = await getProject(importedProject.id).catch(() => null);
          if (updatedProj && !cancelled) {
            setProjectRow(updatedProj);
          }
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    }

    async function start() {
      try {
        const job = await startRepoGeneration(importedProject.id);
        if (cancelled) return;
        setRepoGenerationJob(job);
        if (job.createdFiles.length > 0) await syncSidebarFiles().catch(() => undefined);
        if (job.status !== "done" && job.status !== "failed") {
          await pollJob(job.id);
        } else if (job.status === "done" || job.status === "failed") {
          const updatedProj = await getProject(importedProject.id).catch(() => null);
          if (updatedProj && !cancelled) {
            setProjectRow(updatedProj);
          }
        }
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

  const runAutosave = useCallback(async () => {
    const file = activeFileRef.current;
    if (!file) return;

    const versionAtSave = pendingVersionRef.current;

    try {
      const updated = await updateProjectFile(params.projectId, file.id, {
        scene: file.type === "diagram" ? sceneRef.current : undefined,
        content: file.type === "doc" ? contentRef.current : undefined,
      });
      lastSavedVersionRef.current =
        file.type === "diagram" ? versionAtSave : lastSavedVersionRef.current;
      if (versionAtSave === pendingVersionRef.current) dirtyRef.current = false;
      setSaveStatus("saved");
      upsertStoredFile(toSidebarFile(updated));
    } catch {
      setSaveStatus("error");
    }
  }, [params.projectId, upsertStoredFile]);

  const scheduleAutosave = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus("saving");

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void runAutosave(), AUTOSAVE_DELAY_MS);
  }, [runAutosave]);

  // Excalidraw Scene Change Handler
  const handleSceneChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      const version = sceneElementsVersion(elements);
      if (version === lastSavedVersionRef.current) return;

      const scene = { elements, appState: sanitizeSceneAppState(appState), files };
      sceneRef.current = scene;

      const currentDraft = draftRef.current;
      if (currentDraft && !isSignedInRef.current) {
        lastSavedVersionRef.current = version;
        const fileId = currentFileIdRef.current ?? currentDraft.files[0]?.id;
        if (fileId) {
          const nextDraft = {
            ...currentDraft,
            files: currentDraft.files.map((f) => (f.id === fileId ? { ...f, scene } : f)),
          };
          draftRef.current = nextDraft;
          saveGuestProjectDraft(nextDraft);
          setDraft(nextDraft);
        }
        return;
      }

      if (
        isSignedInRef.current &&
        activeFileRef.current &&
        activeFileRef.current.type === "diagram"
      ) {
        pendingVersionRef.current = version;
        scheduleAutosave();
      }
    },
    [scheduleAutosave],
  );

  // Markdown Doc Change Handler
  const handleDocChange = useCallback(
    (value: string) => {
      if (contentRef.current === value) return;
      contentRef.current = value;
      setDocContent(value);

      const currentDraft = draftRef.current;
      if (currentDraft && !isSignedInRef.current) {
        const fileId = currentFileIdRef.current ?? currentDraft.files[0]?.id;
        if (fileId) {
          const nextDraft = {
            ...currentDraft,
            files: currentDraft.files.map((f) => (f.id === fileId ? { ...f, content: value } : f)),
          };
          draftRef.current = nextDraft;
          saveGuestProjectDraft(nextDraft);
          setDraft(nextDraft);
        }
        return;
      }

      if (isSignedInRef.current && activeFileRef.current && activeFileRef.current.type === "doc") {
        pendingVersionRef.current += 1;
        scheduleAutosave();
      }
    },
    [scheduleAutosave],
  );

  // pagehide handler to flush debounce edits
  useEffect(() => {
    function flush() {
      if (!isSignedInRef.current || !dirtyRef.current) return;

      const file = activeFileRef.current;
      if (!file) return;

      fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${params.projectId}/files/${file.id}`, {
        method: "PATCH",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: file.type === "diagram" ? sceneRef.current : undefined,
          content: file.type === "doc" ? contentRef.current : undefined,
        }),
      }).catch(() => {});
    }

    window.addEventListener("pagehide", flush);

    return () => window.removeEventListener("pagehide", flush);
  }, [params.projectId]);

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    [],
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

  // Manual save trigger
  async function saveActiveFile() {
    if (!session.data?.user) {
      await saveDraftAfterLogin();
      return;
    }

    const file = activeFile;
    if (!file) return;

    setSavePending(true);
    setSaveError(null);
    setSaveStatus("saving");

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    try {
      const updated = await updateProjectFile(params.projectId, file.id, {
        content: file.type === "doc" ? contentRef.current : undefined,
        scene: file.type === "diagram" ? sceneRef.current : undefined,
      });

      setActiveFile(updated);
      upsertStoredFile(toSidebarFile(updated));
      if (updated.type === "doc") {
        contentRef.current = fileContentToText(updated.content);
        setDocContent(contentRef.current);
      }
      dirtyRef.current = false;
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Could not save file.");
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
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    router.push(`/login?redirect=${redirect}`);
  }

  async function signOut() {
    await authClient.signOut();
    router.refresh();
  }

  function openWorkspaceFile(fileId: string) {
    setStoredActiveFileId(fileId);
    router.push(`/project/${params.projectId}/workspace/${fileId}`);
  }

  // Inline Rename file name
  function beginEditName() {
    setNameDraft(activeFile?.name ?? draft?.name ?? "Your first design");
    setIsEditingName(true);
  }

  function cancelName() {
    skipCommitRef.current = true;
    setIsEditingName(false);
  }

  async function commitName() {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setIsEditingName(false);
      return;
    }
    setIsEditingName(false);

    const name = nameDraft.trim();
    if (!name) return;

    const currentDraft = draftRef.current;
    if (currentDraft && !isSignedIn) {
      if (name === currentDraft.name) return;
      const nextDraft = { ...currentDraft, name };
      draftRef.current = nextDraft;
      saveGuestProjectDraft(nextDraft);
      setDraft(nextDraft);
      return;
    }

    if (activeFile && name !== activeFile.name) {
      try {
        const updated = await updateProjectFile(params.projectId, activeFile.id, { name });
        setActiveFile(updated);
        upsertStoredFile(toSidebarFile(updated));
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Could not rename file.");
      }
    }
  }

  function leaveWithoutSaving() {
    const currentDraft = draftRef.current;
    if (currentDraft) {
      deleteGuestProjectDraft(currentDraft.id);
      draftRef.current = null;
      setDraft(null);
    }
    setLeavePromptOpen(false);
    router.push("/dashboard");
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
            {isEditingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => void commitName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  else if (event.key === "Escape") cancelName();
                }}
                className="rounded-[6px] border border-od-border-soft px-1.5 py-0.5 text-[14px] font-medium text-od-ink outline-none focus:border-od-ink"
              />
            ) : (
              <button
                type="button"
                onClick={beginEditName}
                title="Rename file"
                className="-mx-1.5 block max-w-full truncate rounded-[6px] px-1.5 py-0.5 text-left text-[15px] font-semibold text-od-ink transition hover:bg-od-canvas/40"
              >
                {activeFileName}
              </button>
            )}
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
              {saveStatus === "saving" && (
                <p className="hidden text-[12px] text-amber-500 sm:block">Saving…</p>
              )}
              {saveStatus === "saved" && (
                <p className="hidden text-[12px] text-od-green sm:block">Saved</p>
              )}
              {saveStatus === "error" && (
                <p className="hidden text-[12px] text-red-500 sm:block">Save failed</p>
              )}
              {!session.data?.user && (
                <p className="hidden text-[12px] text-od-ink-faint sm:block">Guest</p>
              )}
              {saveError && (
                <p className="hidden max-w-[260px] truncate text-[12px] text-red-600 sm:block">
                  {saveError}
                </p>
              )}
              {!session.data?.user ? (
                <button
                  type="button"
                  onClick={signInToSave}
                  className="h-8 rounded-[8px] bg-od-ink px-3 text-[12px] font-medium text-white"
                >
                  Sign in to save
                </button>
              ) : (
                <button
                  type="button"
                  onClick={saveActiveFile}
                  disabled={savePending}
                  className="h-8 rounded-[8px] bg-od-ink px-3 text-[12px] font-medium text-white disabled:cursor-wait disabled:opacity-70"
                >
                  {savePending ? "Saving..." : "Save"}
                </button>
              )}
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeFile?.type === "doc" ? (
            <div className="flex h-full flex-col bg-white">
              <MilkdownDocEditor
                key={activeFile.id}
                value={docContent}
                onChange={handleDocChange}
              />
            </div>
          ) : (
            <Whiteboard
              initialScene={initialScene}
              onAPIReady={handleExcalidrawAPI}
              onSceneChange={handleSceneChange}
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
            repoGenerationJob={repoGenerationJob}
            repoGenerationError={repoGenerationError}
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
                onClick={leaveWithoutSaving}
                className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink-muted hover:text-od-ink"
              >
                Leave without saving
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
