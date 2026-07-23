import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { User } from "better-auth";
import { deleteGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import { createProject, createProjectFile } from "@/lib/projects-client";
import type { SaveStatus } from "./helpers";

interface PromotionOptions {
  currentFileIdRef: RefObject<string | null>;
  draft: GuestProjectDraft | null;
  draftRef: RefObject<GuestProjectDraft | null>;
  savePending: boolean;
  setDraft: Dispatch<SetStateAction<GuestProjectDraft | null>>;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setSaveStatus: Dispatch<SetStateAction<SaveStatus>>;
  user?: User | null;
}

export function useGuestDraftPromotion(options: PromotionOptions) {
  const {
    currentFileIdRef,
    draft,
    draftRef,
    savePending,
    setDraft,
    setSaveError,
    setSaveStatus,
    user,
  } = options;
  const router = useRouter();
  const promotionStartedRef = useRef(false);

  const saveDraftAfterLogin = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (!currentDraft || !user) return;
    setSaveStatus("saving");
    setSaveError(null);

    try {
      const currentFile =
        currentDraft.files.find((file) => file.id === currentFileIdRef.current) ??
        currentDraft.files[0];
      if (!currentFile) return setSaveError("No file to save.");
      const project = await createProject({
        name: currentDraft.name,
        description: currentDraft.description,
      });
      const files = [];
      for (const draftFile of currentDraft.files) {
        const file = await createProjectFile(project.id, {
          name: draftFile.name,
          type: draftFile.type ?? "diagram",
          scene: (draftFile.type ?? "diagram") === "diagram" ? draftFile.scene : undefined,
          spec: draftFile.spec,
          content: draftFile.type === "doc" ? draftFile.content : undefined,
          history: draftFile.history,
        });
        files.push({ draftId: draftFile.id, file });
      }
      const activeFile =
        files.find((item) => item.draftId === currentFile.id)?.file ?? files[0]?.file;
      if (!activeFile) return setSaveError("No file to save.");
      deleteGuestProjectDraft(currentDraft.id);
      draftRef.current = null;
      setDraft(null);
      router.replace(`/project/${project.id}/workspace/${activeFile.id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save project.");
      setSaveStatus("error");
    } finally {
      setSaveStatus((status) => (status === "saving" ? "idle" : status));
    }
  }, [currentFileIdRef, draftRef, router, setDraft, setSaveError, setSaveStatus, user]);

  useEffect(() => {
    if (!draft || !user || savePending || promotionStartedRef.current) return;
    promotionStartedRef.current = true;
    void saveDraftAfterLogin();
  }, [draft, saveDraftAfterLogin, savePending, user]);

  return saveDraftAfterLogin;
}
