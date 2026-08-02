"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { StoredChatMessage } from "@/lib/chat-history";
import { deleteGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import type { SavedProject, SavedProjectFile } from "@/lib/projects-client";
import { useWorkspaceLayoutStore } from "@/lib/workspace-layout-store";
import type { SaveStatus } from "./helpers";
import { useWorkspacePaneResize } from "./useWorkspacePaneResize";
import { useRepoGeneration } from "./useRepoGeneration";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import { useWorkspaceProjectLoader } from "./useWorkspaceProjectLoader";
import { useWorkspaceFileActions } from "./useWorkspaceFileActions";
import { useWorkspaceFileName } from "./useWorkspaceFileName";
import { useGuestDraftPromotion } from "./useGuestDraftPromotion";
import { useGuestDraftProtection } from "./useGuestDraftProtection";
import { useExcalidrawScene } from "./useExcalidrawScene";

export function useWorkspaceLayoutController() {
  const params = useParams<{ projectId: string; workspaceId?: string }>();
  const router = useRouter();
  const session = authClient.useSession();
  const [draft, setDraft] = useState<GuestProjectDraft | null>(null);
  const [projectRow, setProjectRow] = useState<SavedProject | null>(null);
  const [activeFile, setActiveFile] = useState<SavedProjectFile | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [initialScene, setInitialScene] = useState<unknown>(null);
  // Chat transcript read from IndexedDB, used only until the thread fetch lands.
  const [localHistory, setLocalHistory] = useState<StoredChatMessage[] | null>(null);
  // File type from the same cache entry, so the chat panel knows which agent it
  // is before `activeFile` arrives.
  const [localFileType, setLocalFileType] = useState<SavedProjectFile["type"] | null>(null);
  const [docContent, setDocContent] = useState("");
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [showFirstFileDialog, setShowFirstFileDialog] = useState(false);
  const [firstFileName, setFirstFileName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const savePending = saveStatus === "saving";

  const draftRef = useRef<GuestProjectDraft | null>(null);
  const currentFileIdRef = useRef<string | null>(null);
  const panes = useWorkspacePaneResize();
  useEffect(() => {
    panes.closeSidebar();
  }, [panes.closeSidebar, params.projectId, params.workspaceId]);
  const storedProjectId = useWorkspaceLayoutStore((state) => state.projectId);
  const projectName = useWorkspaceLayoutStore((state) => state.projectName);
  const sidebarFiles = useWorkspaceLayoutStore((state) => state.files);
  const activeFileId = useWorkspaceLayoutStore((state) => state.activeFileId);
  const setProjectSnapshot = useWorkspaceLayoutStore((state) => state.setProjectSnapshot);
  const setStoredActiveFileId = useWorkspaceLayoutStore((state) => state.setActiveFileId);
  const upsertStoredFile = useWorkspaceLayoutStore((state) => state.upsertFile);
  const removeStoredFile = useWorkspaceLayoutStore((state) => state.removeFile);
  const { repoGenerationError, repoGenerationJob } = useRepoGeneration({
    activeFileIdRef: currentFileIdRef,
    draft,
    project: projectRow,
    setProject: setProjectRow,
    setProjectSnapshot,
    user: session.data?.user,
  });

  const isSignedIn = Boolean(session.data?.user);
  const shouldProtectGuestDraft = Boolean(draft) && !isSignedIn;
  const excalidraw = useExcalidrawScene(initialScene);
  const persistence = useWorkspacePersistence({
    activeFile,
    currentFileIdRef,
    draftRef,
    isSignedIn,
    projectId: params.projectId,
    setDocContent,
    setDraft,
    setSaveStatus,
    upsertStoredFile,
  });
  useWorkspaceProjectLoader({
    currentFileIdRef,
    draft,
    draftRef,
    initializePersistence: persistence.initialize,
    isSignedIn,
    projectId: params.projectId,
    sessionPending: session.isPending,
    setActiveFile,
    setDocContent,
    setDraft,
    setFileLoading,
    setFirstFileName,
    setLocalFileType,
    setLocalHistory,
    setInitialScene,
    setProject: setProjectRow,
    setProjectSnapshot,
    setSaveError,
    setShowFirstFileDialog,
    workspaceId: params.workspaceId,
  });

  useGuestDraftProtection(shouldProtectGuestDraft, setLeavePromptOpen);
  const saveDraftAfterLogin = useGuestDraftPromotion({
    currentFileIdRef,
    draft,
    draftRef,
    savePending,
    setDraft,
    setSaveError,
    setSaveStatus,
    user: session.data?.user,
  });

  const fileActions = useWorkspaceFileActions({
    activeFile,
    currentFileIdRef,
    draftRef,
    firstFileName,
    isSignedIn,
    persistence,
    projectId: params.projectId,
    projectName,
    removeStoredFile,
    saveDraftAfterLogin,
    setActiveFile,
    setDocContent,
    setDraft,
    setFileLoading,
    setFirstFileName,
    setInitialScene,
    setProjectSnapshot,
    setSaveError,
    setSaveStatus,
    setShowFirstFileDialog,
    setStoredActiveFileId,
    sidebarFiles,
    upsertStoredFile,
  });
  const fileName = useWorkspaceFileName({
    activeFile,
    currentFileIdRef,
    draft,
    draftRef,
    isSignedIn,
    projectId: params.projectId,
    setActiveFile,
    setDraft,
    setSaveError,
    upsertStoredFile,
  });

  function signInToSave() {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    router.push(`/login?redirect=${redirect}`);
  }

  async function signOut() {
    await authClient.signOut();
  }

  function continueAsGuest() {
    router.push("/dashboard");
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

  async function navigateToDashboard() {
    if (isSignedIn) await fileActions.saveActiveFile();
    router.push("/dashboard");
  }

  const accountName = session.data?.user?.name || session.data?.user?.email || "Guest";
  const hasCurrentProjectSnapshot = storedProjectId === params.projectId;
  const sidebarProjectName = hasCurrentProjectSnapshot ? projectName : "OpenDiagram";
  const sidebarFilesForProject = hasCurrentProjectSnapshot ? sidebarFiles : [];
  const activeFileName =
    activeFile?.name ??
    sidebarFilesForProject.find((file) => file.id === activeFileId)?.name ??
    "Untitled file";
  // Two separate questions, and conflating them is what kept the chat panel
  // behind a spinner until the network answered.
  //
  // This one is the old condition, unchanged. It guards the auto-run of a seed
  // prompt carried in from the dashboard, which must not fire against an
  // identity that is still provisional -- a guest draft mid-promotion would
  // remount the panel underneath a live request.
  const agentSeedPending =
    session.isPending ||
    fileLoading ||
    Boolean(draft && isSignedIn) ||
    Boolean(
      isSignedIn &&
      (!activeFile ||
        activeFile.projectId !== params.projectId ||
        (params.workspaceId && activeFile.id !== params.workspaceId)),
    );

  // This one only hides the panel, and now hides it for the single case that
  // genuinely has no stable identity: promotion, where the file is about to
  // change owner. A plain signed-in load no longer waits at all -- the ids come
  // from the URL and the transcript from IndexedDB, so there is nothing left to
  // wait for. It used to wait for `activeFile`, which meant the cached
  // conversation was read in about a millisecond and then covered by a spinner
  // for the three network waves it took to fetch a file the canvas had already
  // painted without.
  const agentContextPending = session.isPending || Boolean(draft && isSignedIn);

  // Agent identity comes from route params, not from the loaded file. Reading it
  // off `activeFile` made the thread request wait for `getProjectFile`, which
  // waits for `getProject` + `listProjectFiles` -- four sequential round trips
  // before the conversation could even be asked for. Both ids are in the URL the
  // entire time.
  //
  // Undefined for guests and for a signed-in user still sitting on an unpromoted
  // draft: neither has a server-side project to ask about.
  const agentProjectId = isSignedIn && !draft ? params.projectId : undefined;
  const agentFileId = params.workspaceId ?? activeFile?.id ?? currentFileIdRef.current ?? undefined;
  // Cached type until the file lands, so the panel knows whether it is the canvas
  // agent or the project agent without waiting to be told.
  const agentFileType = activeFile?.type ?? localFileType ?? undefined;
  // The panel's remount key. Built from the same params so it is stable from the
  // first render of any navigation that names a file -- it used to start
  // undefined and turn real when the fetch landed, remounting the whole panel and
  // discarding the transcript it had just painted from cache.
  const agentFileIdentity =
    agentProjectId && agentFileId ? `${agentProjectId}:${agentFileId}` : undefined;
  // Length-checked rather than `??`: the file route normalises a missing content
  // row to `history: []`, and an empty array is not nullish, so `??` handed the
  // panel an empty transcript and threw the cached one away.
  const activeHistory =
    activeFile?.history && activeFile.history.length > 0
      ? activeFile.history
      : (localHistory ?? undefined);

  return {
    state: {
      accountImage: session.data?.user?.image,
      accountName,
      activeFile,
      activeFileId,
      activeFileName,
      activeHistory,
      agentContextPending,
      agentFileId,
      agentFileIdentity,
      agentFileType,
      agentProjectId,
      agentSeedPending,
      agentWidth: panes.agentWidth,
      docContent,
      draft,
      excalidrawAPI: excalidraw.excalidrawAPI,
      fileLoading,
      firstFileName,
      initialScene,
      isAgentOpen: panes.isAgentOpen,
      isSidebarOpen: panes.isSidebarOpen,
      isEditingName: fileName.isEditingName,
      isSignedIn,
      leavePromptOpen,
      nameDraft: fileName.nameDraft,
      repoGenerationError,
      repoGenerationJob,
      saveError,
      savePending,
      saveStatus,
      showFirstFileDialog,
      sidebarFilesForProject,
      sidebarProjectName,
      sidebarWidth: panes.sidebarWidth,
    },
    actions: {
      beginEditName: fileName.beginEditName,
      cancelFirstFileDialog: () => {
        setShowFirstFileDialog(false);
        router.push("/dashboard");
      },
      cancelName: fileName.cancelName,
      closeSidebar: panes.closeSidebar,
      closeAgent: panes.closeAgent,
      commitName: fileName.commitName,
      continueAsGuest,
      createWorkspaceFile: fileActions.createWorkspaceFile,
      deleteWorkspaceFile: fileActions.deleteWorkspaceFile,
      handleCreateFirstFile: fileActions.handleCreateFirstFile,
      handleDocChange: persistence.handleDocChange,
      handleExcalidrawAPI: excalidraw.handleExcalidrawAPI,
      handleAgentHistoryChange: fileActions.handleAgentHistoryChange,
      handleResizeStart: panes.handleResizeStart,
      handleSceneChange: persistence.handleSceneChange,
      leaveWithoutSaving,
      navigateToDashboard,
      openAgent: panes.openAgent,
      openSidebar: panes.openSidebar,
      openWorkspaceFile: fileActions.openWorkspaceFile,
      saveActiveFile: fileActions.saveActiveFile,
      setFirstFileName,
      setNameDraft: fileName.setNameDraft,
      signInToSave,
      signOut,
    },
  };
}
