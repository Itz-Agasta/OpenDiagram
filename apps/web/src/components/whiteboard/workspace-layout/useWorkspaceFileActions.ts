import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { StoredChatMessage } from "@/lib/chat-history";
import { saveGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import { writeLocalChat } from "@/lib/local-chat";
import { queueProjectFilePatch } from "@/lib/project-file-sync";
import { createProjectFile, type SavedProjectFile } from "@/lib/projects-client";
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
    saveDraftAfterLogin,
    setActiveFile,
    setDocContent,
    setDraft,
    setInitialScene,
    setProjectSnapshot,
    setSaveError,
    setSaveStatus,
    setShowFirstFileDialog,
    upsertStoredFile,
  } = options;

  async function saveActiveFile() {
    if (!isSignedIn) return saveDraftAfterLogin();
    if (!activeFile) return;
    setSaveError(null);
    setSaveStatus("saving");
    persistence.clearAutosave();
    try {
      // Through the shared queue, like the autosave it replaces: direct, it put a
      // second scene PATCH on the wire against a row an autosave was already
      // writing -- pressing Save inside the autosave interval. `clearAutosave`
      // above stops a NEW one being scheduled, it does not recall a queued one.
      //
      // "full" because the response is read back below to re-seed a doc editor.
      const updated = await queueProjectFilePatch(
        projectId,
        activeFile.id,
        {
          content: activeFile.type === "doc" ? persistence.contentRef.current : undefined,
          scene: activeFile.type === "diagram" ? persistence.sceneRef.current : undefined,
        },
        "full",
      );
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

  const handleAgentHistoryChange = useCallback(
    (history: StoredChatMessage[]) => {
      const currentDraft = draftRef.current;
      const fileId = currentFileIdRef.current ?? currentDraft?.files[0]?.id;
      if (!fileId) return;

      // The one place every chat path reports a completed turn -- both chat hooks
      // call `onHistoryChange` immediately before persisting -- so caching here
      // covers all six write sites without threading IndexedDB through either of
      // them. This is what lets the panel paint from disk on the next open
      // instead of waiting out the file fetch.
      void writeLocalChat(fileId, projectId, history);

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
    [currentFileIdRef, draftRef, isSignedIn, projectId, setActiveFile, setDraft],
  );

  return {
    handleAgentHistoryChange,
    handleCreateFirstFile,
    saveActiveFile,
  };
}
