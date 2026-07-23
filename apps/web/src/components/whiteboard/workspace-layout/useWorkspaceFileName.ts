import { useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { saveGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import { updateProjectFile, type SavedProjectFile } from "@/lib/projects-client";
import type { WorkspaceSidebarFile } from "@/lib/workspace-layout-store";
import { toSidebarFile } from "./helpers";

interface FileNameOptions {
  activeFile: SavedProjectFile | null;
  currentFileIdRef: RefObject<string | null>;
  draft: GuestProjectDraft | null;
  draftRef: RefObject<GuestProjectDraft | null>;
  isSignedIn: boolean;
  projectId: string;
  setActiveFile: Dispatch<SetStateAction<SavedProjectFile | null>>;
  setDraft: Dispatch<SetStateAction<GuestProjectDraft | null>>;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  upsertStoredFile: (file: WorkspaceSidebarFile) => void;
}

export function useWorkspaceFileName(options: FileNameOptions) {
  const {
    activeFile,
    currentFileIdRef,
    draft,
    draftRef,
    isSignedIn,
    projectId,
    setActiveFile,
    setDraft,
    setSaveError,
    upsertStoredFile,
  } = options;
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const skipCommitRef = useRef(false);

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
      const fileId = currentFileIdRef.current ?? currentDraft.files[0]?.id;
      const currentFile = currentDraft.files.find((file) => file.id === fileId);
      if (!fileId || !currentFile || name === currentFile.name) return;
      const nextDraft = {
        ...currentDraft,
        files: currentDraft.files.map((file) => (file.id === fileId ? { ...file, name } : file)),
      };
      draftRef.current = nextDraft;
      saveGuestProjectDraft(nextDraft);
      setDraft(nextDraft);
      setActiveFile((current) => (current?.id === fileId ? { ...current, name } : current));
      upsertStoredFile({ id: fileId, name, type: currentFile.type ?? "diagram" });
      return;
    }

    if (!activeFile || name === activeFile.name) return;
    try {
      const updated = await updateProjectFile(projectId, activeFile.id, { name });
      setActiveFile(updated);
      upsertStoredFile(toSidebarFile(updated));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not rename file.");
    }
  }

  return { beginEditName, cancelName, commitName, isEditingName, nameDraft, setNameDraft };
}
