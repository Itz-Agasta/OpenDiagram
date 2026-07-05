"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useParams, useRouter } from "next/navigation";
import { env } from "@OpenDiagram/env/web";
import { authClient } from "@/lib/auth-client";
import { applyDiagramToCanvas } from "@/lib/excalidraw-utils";
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
  listProjectFiles,
  streamRepoGeneration,
  updateProjectFile,
  type RepoGenerationJob,
  type SavedProject,
  type SavedProjectFile,
} from "@/lib/projects-client";
import { useWorkspaceLayoutStore } from "@/lib/workspace-layout-store";
import {
  AGENT_MAX_WIDTH,
  AGENT_MIN_WIDTH,
  AUTOSAVE_DELAY_MS,
  CONTENT_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  fileContentToText,
  initialElementsVersion,
  sanitizeSceneAppState,
  sceneElementsVersion,
  toSidebarFile,
  type SaveStatus,
} from "./helpers";

type ResizeState = {
  pane: "sidebar" | "agent";
  startX: number;
  startWidth: number;
  onMove: (event: MouseEvent) => void;
  onUp: () => void;
};

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

export function useWorkspaceLayoutController() {
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const savePending = saveStatus === "saving";

  const draftRef = useRef<GuestProjectDraft | null>(null);
  const sceneRef = useRef<unknown>(null);
  const contentRef = useRef("");
  const currentFileIdRef = useRef<string | null>(null);
  const startedRepoGenerationRef = useRef<string | null>(null);
  const activeFileRef = useRef<SavedProjectFile | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const promotionStartedRef = useRef(false);
  const lastSavedVersionRef = useRef(0);
  const pendingVersionRef = useRef(0);
  const skipCommitRef = useRef(false);
  const resizeRef = useRef<ResizeState | null>(null);

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

  useEffect(() => {
    if (!draft || isSignedIn) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draft, isSignedIn]);

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

        if (!active) return;
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
    isSignedIn,
    params.projectId,
    params.workspaceId,
    session.isPending,
    setProjectSnapshot,
  ]);

  const saveDraftAfterLogin = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (!currentDraft || !session.data?.user) return;

    setSaveStatus("saving");
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
      const files = [];
      for (const draftFile of currentDraft.files) {
        const file = await createProjectFile(project.id, {
          name: draftFile.name,
          type: "diagram",
          scene: draftFile.scene,
          spec: draftFile.spec,
        });
        files.push({ draftId: draftFile.id, file });
      }
      const activeFile =
        files.find((item) => item.draftId === currentFile.id)?.file ?? files[0]?.file;
      if (!activeFile) {
        setSaveError("No file to save.");
        return;
      }

      deleteGuestProjectDraft(currentDraft.id);
      draftRef.current = null;
      setDraft(null);
      router.replace(`/project/${project.id}/workspace/${activeFile.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save project.");
      setSaveStatus("error");
    } finally {
      setSaveStatus((prev) => (prev === "saving" ? "idle" : prev));
    }
  }, [router, session.data?.user]);

  useEffect(() => {
    if (!draft || !session.data?.user || savePending || promotionStartedRef.current) return;

    promotionStartedRef.current = true;
    void saveDraftAfterLogin();
  }, [draft, saveDraftAfterLogin, savePending, session.data?.user]);

  useEffect(() => {
    if (!session.data?.user || draft || projectRow?.source !== "github_import") return;
    if (projectRow.generationStatus === "done") {
      setRepoGenerationJob(null);
      return;
    }
    if (startedRepoGenerationRef.current === projectRow.id) return;

    const importedProject = projectRow;
    let cancelled = false;
    const abortController = new AbortController();
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

    async function start() {
      try {
        const finalJob = await streamRepoGeneration(
          importedProject.id,
          (job) => {
            if (cancelled) return;
            setRepoGenerationJob(job);
            if (job.createdFiles.length > 0) void syncSidebarFiles().catch(() => undefined);
          },
          abortController.signal,
        );
        if (cancelled) return;
        if (finalJob.status === "done" || finalJob.status === "failed") {
          const updatedProj = await getProject(importedProject.id).catch(() => null);
          if (updatedProj && !cancelled) setProjectRow(updatedProj);
        }
      } catch (err) {
        if (cancelled) return;
        startedRepoGenerationRef.current = null;
        setRepoGenerationError(
          err instanceof Error ? err.message : "Could not start repository generation.",
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      abortController.abort();
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
        void loadWelcomeScene(excalidrawAPI);
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

    const file = activeFile;
    if (!file) return;

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
    }
  }

  async function handleCreateFirstFile(event: React.FormEvent) {
    event.preventDefault();
    const name = firstFileName.trim() || "Untitled diagram";

    try {
      const file = await createProjectFile(params.projectId, { name, type: "diagram" });
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

  function signInToSave() {
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
  }, [clampAgentWidth, clampSidebarWidth, setAgentWidth, setSidebarWidth]);

  const handleResizeStart = useCallback(
    (pane: "sidebar" | "agent", e: React.MouseEvent) => {
      e.preventDefault();

      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;

        if (resizeRef.current.pane === "sidebar") {
          const dx = ev.clientX - resizeRef.current.startX;
          const newWidth = clampSidebarWidth(resizeRef.current.startWidth + dx);
          if (newWidth !== sidebarWidthRef.current) setSidebarWidth(newWidth);
          return;
        }

        const dx = resizeRef.current.startX - ev.clientX;
        const newWidth = clampAgentWidth(resizeRef.current.startWidth + dx);
        if (newWidth !== agentWidthRef.current) setAgentWidth(newWidth);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        resizeRef.current = null;
      };

      resizeRef.current = {
        pane,
        startX: e.clientX,
        startWidth: pane === "sidebar" ? sidebarWidthRef.current : agentWidthRef.current,
        onMove,
        onUp,
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [clampAgentWidth, clampSidebarWidth, setAgentWidth, setSidebarWidth],
  );

  useEffect(() => {
    return () => {
      const resize = resizeRef.current;
      if (!resize) return;
      document.removeEventListener("mousemove", resize.onMove);
      document.removeEventListener("mouseup", resize.onUp);
      resizeRef.current = null;
    };
  }, []);

  const accountName = session.data?.user?.name || session.data?.user?.email || "Guest workspace";
  const hasCurrentProjectSnapshot = storedProjectId === params.projectId;
  const sidebarProjectName = hasCurrentProjectSnapshot ? projectName : "OpenDiagram";
  const sidebarFilesForProject = hasCurrentProjectSnapshot ? sidebarFiles : [];
  const activeFileName =
    activeFile?.name ??
    sidebarFilesForProject.find((file) => file.id === activeFileId)?.name ??
    "Untitled file";

  return {
    state: {
      accountImage: session.data?.user?.image,
      accountName,
      activeFile,
      activeFileId,
      activeFileName,
      agentWidth,
      docContent,
      draft,
      excalidrawAPI,
      firstFileName,
      initialScene,
      isAgentOpen,
      isEditingName,
      isSignedIn,
      leavePromptOpen,
      nameDraft,
      repoGenerationError,
      repoGenerationJob,
      saveError,
      savePending,
      saveStatus,
      showFirstFileDialog,
      sidebarFilesForProject,
      sidebarProjectName,
      sidebarWidth,
      currentFileId: currentFileIdRef.current,
    },
    actions: {
      beginEditName,
      cancelFirstFileDialog: () => {
        setShowFirstFileDialog(false);
        router.push("/dashboard");
      },
      cancelName,
      closeAgent,
      commitName,
      handleCreateFirstFile,
      handleDocChange,
      handleExcalidrawAPI,
      handleResizeStart,
      handleSceneChange,
      leaveWithoutSaving,
      openAgent,
      openWorkspaceFile,
      saveActiveFile,
      setFirstFileName,
      setNameDraft,
      signInToSave,
      signOut,
    },
  };
}
