"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
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

  const accountName = session.data?.user?.name || session.data?.user?.email || "Guest";
  const hasCurrentProjectSnapshot = storedProjectId === params.projectId;
  const sidebarProjectName = hasCurrentProjectSnapshot ? projectName : "OpenDiagram";
  const sidebarFilesForProject = hasCurrentProjectSnapshot ? sidebarFiles : [];
  const activeFileName =
    activeFile?.name ??
    sidebarFilesForProject.find((file) => file.id === activeFileId)?.name ??
    "Untitled file";
  const agentContextPending =
    session.isPending ||
    fileLoading ||
    Boolean(draft && isSignedIn) ||
    Boolean(
      isSignedIn &&
      (!activeFile ||
        activeFile.projectId !== params.projectId ||
        (params.workspaceId && activeFile.id !== params.workspaceId)),
    );

  return {
    state: {
      accountImage: session.data?.user?.image,
      accountName,
      activeFile,
      activeFileId,
      activeFileName,
      agentContextPending,
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
      currentFileId: currentFileIdRef.current,
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
