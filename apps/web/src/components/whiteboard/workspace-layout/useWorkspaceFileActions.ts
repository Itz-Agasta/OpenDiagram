import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { StoredChatMessage } from "@/lib/chat-history";
import { saveGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import {
  createProjectFile,
  deleteProjectFile,
  updateProjectFile,
  type ProjectFileType,
  type SavedProjectFile,
} from "@/lib/projects-client";
import type { WorkspaceSidebarFile } from "@/lib/workspace-layout-store";
import { fileContentToText, toSidebarFile, type SaveStatus } from "./helpers";
import type { useWorkspacePersistence } from "./useWorkspacePersistence";

interface FileActionsOptions {
  activeFile: SavedProjectFile | null;
  currentFileIdRef: RefObject<string | null>;
  draftRef: RefObject<GuestProjectDraft | null>;
  firstFileName: string;
  isSignedIn: boolean;
  persistence: ReturnType<typeof useWorkspacePersistence>;
  projectId: string;
  projectName: string;
  saveDraftAfterLogin: () => Promise<void>;
  setActiveFile: Dispatch<SetStateAction<SavedProjectFile | null>>;
  setDocContent: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<GuestProjectDraft | null>>;
  setFileLoading: Dispatch<SetStateAction<boolean>>;
  setFirstFileName: Dispatch<SetStateAction<string>>;
  setInitialScene: Dispatch<SetStateAction<unknown>>;
  setProjectSnapshot: (snapshot: {
    projectId: string;
    projectName: string;
    files: WorkspaceSidebarFile[];
    activeFileId: string | null;
  }) => void;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setSaveStatus: Dispatch<SetStateAction<SaveStatus>>;
  setShowFirstFileDialog: Dispatch<SetStateAction<boolean>>;
  setStoredActiveFileId: (fileId: string | null) => void;
  sidebarFiles: WorkspaceSidebarFile[];
  removeStoredFile: (fileId: string) => void;
  upsertStoredFile: (file: WorkspaceSidebarFile) => void;
}

export function useWorkspaceFileActions(options: FileActionsOptions) {
  const router = useRouter();
  const {
    activeFile,
    currentFileIdRef,
    draftRef,
    firstFileName,
    isSignedIn,
    persistence,
    projectId,
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
  } = options;

  async function saveActiveFile() {
    if (!isSignedIn) return saveDraftAfterLogin();
    if (!activeFile) return;
    setSaveError(null);
    setSaveStatus("saving");
    persistence.clearAutosave();
    try {
      const updated = await updateProjectFile(projectId, activeFile.id, {
        content: activeFile.type === "doc" ? persistence.contentRef.current : undefined,
        scene: activeFile.type === "diagram" ? persistence.sceneRef.current : undefined,
      });
      setActiveFile(updated);
      upsertStoredFile(toSidebarFile(updated));
      persistence.markClean();
      if (updated.type === "doc") {
        const content = fileContentToText(updated.content);
        persistence.initialize(updated.type, null, content);
        setDocContent(content);
      }
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "Could not save file.");
    }
  }

  async function handleCreateFirstFile(event: React.FormEvent) {
    event.preventDefault();
    const fileName = firstFileName.trim() || "Untitled diagram";
    try {
      const file = await createProjectFile(projectId, { name: fileName, type: "diagram" });
      setShowFirstFileDialog(false);
      setActiveFile(file);
      setProjectSnapshot({
        projectId,
        projectName,
        files: [toSidebarFile(file)],
        activeFileId: file.id,
      });
      currentFileIdRef.current = file.id;
      persistence.initialize(file.type, null, "");
      setInitialScene(null);
      router.replace(`/project/${projectId}/workspace/${file.id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not create file.");
    }
  }

  function openWorkspaceFile(fileId: string) {
    if (fileId === currentFileIdRef.current) return;
    setFileLoading(true);
    setStoredActiveFileId(fileId);
    router.push(`/project/${projectId}/workspace/${fileId}`);
  }

  async function createWorkspaceFile(type: ProjectFileType) {
    if (!isSignedIn) return setSaveError("Log in to save your project before adding files.");
    setSaveError(null);
    setSaveStatus("saving");
    try {
      const file = await createProjectFile(projectId, {
        name: type === "doc" ? "Untitled doc" : "Untitled diagram",
        type,
      });
      setActiveFile(file);
      upsertStoredFile(toSidebarFile(file));
      setStoredActiveFileId(file.id);
      currentFileIdRef.current = file.id;
      persistence.initialize(file.type, null, "");
      setDocContent("");
      setInitialScene(null);
      setSaveStatus("saved");
      router.push(`/project/${projectId}/workspace/${file.id}`);
    } catch (error) {
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "Could not create file.");
    }
  }

  async function deleteWorkspaceFile(fileId: string) {
    if (!isSignedIn) return setSaveError("Log in to save your project before deleting files.");
    if (!window.confirm("Delete this file? This cannot be undone.")) return;
    setSaveError(null);
    setSaveStatus("saving");
    const deletingActiveFile = persistence.activeFileRef.current?.id === fileId;
    if (deletingActiveFile) {
      persistence.invalidateFileAutosave(fileId);
      persistence.clearAutosave();
    }
    try {
      await deleteProjectFile(projectId, fileId);
      removeStoredFile(fileId);
      const nextFile = sidebarFiles.find((file) => file.id !== fileId);
      if (persistence.activeFileRef.current?.id === fileId) {
        setActiveFile(null);
        currentFileIdRef.current = nextFile?.id ?? null;
        persistence.initialize("diagram", null, "");
        setDocContent("");
        setInitialScene(null);
        setStoredActiveFileId(nextFile?.id ?? null);
        if (nextFile) router.replace(`/project/${projectId}/workspace/${nextFile.id}`);
        else {
          setShowFirstFileDialog(true);
          setFirstFileName("");
          router.replace(`/project/${projectId}/workspace`);
        }
      }
      persistence.markClean();
      setSaveStatus("saved");
    } catch (error) {
      if (deletingActiveFile) persistence.restoreFileAutosave(fileId);
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "Could not delete file.");
    }
  }

  const handleAgentHistoryChange = useCallback(
    (history: StoredChatMessage[]) => {
      const currentDraft = draftRef.current;
      const fileId = currentFileIdRef.current ?? currentDraft?.files[0]?.id;
      if (!fileId) return;
      if (!isSignedIn && currentDraft) {
        const nextDraft = {
          ...currentDraft,
          files: currentDraft.files.map((file) =>
            file.id === fileId ? { ...file, history } : file,
          ),
        };
        draftRef.current = nextDraft;
        saveGuestProjectDraft(nextDraft);
        setDraft(nextDraft);
      }
      setActiveFile((current) => (current?.id === fileId ? { ...current, history } : current));
    },
    [currentFileIdRef, draftRef, isSignedIn, setActiveFile, setDraft],
  );

  return {
    createWorkspaceFile,
    deleteWorkspaceFile,
    handleAgentHistoryChange,
    handleCreateFirstFile,
    openWorkspaceFile,
    saveActiveFile,
  };
}
