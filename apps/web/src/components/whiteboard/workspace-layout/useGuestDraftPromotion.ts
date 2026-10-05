import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { User } from "better-auth";
import { deleteGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import { queueProjectFilePatch } from "@/lib/project-file-sync";
import {
  createProject,
  createProjectFile,
  type SavedProject,
  type SavedProjectFile,
} from "@/lib/projects-client";
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
  const promotionProjectRef = useRef<SavedProject | null>(null);
  const promotedFilesRef = useRef(new Map<string, SavedProjectFile>());
  const promotionDraftIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (promotionDraftIdRef.current === draft?.id) return;
    promotionDraftIdRef.current = draft?.id ?? null;
    promotionStartedRef.current = false;
    promotionProjectRef.current = null;
    promotedFilesRef.current = new Map();
  }, [draft?.id]);

  const promote = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (!currentDraft || !user) return;
    setSaveStatus("saving");
    setSaveError(null);

    try {
      const currentFile =
        currentDraft.files.find((file) => file.id === currentFileIdRef.current) ??
        currentDraft.files[0];
      if (!currentFile) return setSaveError("No file to save.");
      const project =
        promotionProjectRef.current ??
        (await createProject({
          name: currentDraft.name,
          description: currentDraft.description,
        }));
      promotionProjectRef.current = project;
      const files = [];
      for (const draftFile of currentDraft.files) {
        const existingFile = promotedFilesRef.current.get(draftFile.id);
        if (existingFile) {
          files.push({ draftId: draftFile.id, file: existingFile });
          continue;
        }
        const file = await createProjectFile(project.id, {
          name: draftFile.name,
          type: draftFile.type ?? "diagram",
          scene: (draftFile.type ?? "diagram") === "diagram" ? draftFile.scene : undefined,
          spec: draftFile.spec,
          content: draftFile.type === "doc" ? draftFile.content : undefined,
          history: draftFile.history,
        });
        promotedFilesRef.current.set(draftFile.id, file);
        files.push({ draftId: draftFile.id, file });
      }
      const activeFile =
        files.find((item) => item.draftId === currentFile.id)?.file ?? files[0]?.file;
      if (!activeFile) return setSaveError("No file to save.");
      // Edits keep landing in the draft while this runs, and the draft is deleted
      // below. Carry the open file's newest copy over first.
      // ponytail: an edit made during this one PATCH is still lost; the window is
      // one request, and closing it means retrying until the draft stops changing.
      const latest = draftRef.current?.files.find((file) => file.id === currentFile.id);
      if (latest && latest !== currentFile) {
        await queueProjectFilePatch(
          project.id,
          activeFile.id,
          latest.type === "doc" ? { content: latest.content } : { scene: latest.scene },
        );
      }
      deleteGuestProjectDraft(currentDraft.id);
      draftRef.current = null;
      setDraft(null);
      router.replace(`/project/${project.id}/workspace/${activeFile.id}`);
    } catch (error) {
      // Keep the draft and created-project bookkeeping so a user-triggered retry
      // resumes instead of creating duplicate files.
      promotionStartedRef.current = false;
      setSaveError(error instanceof Error ? error.message : "Could not save project.");
      setSaveStatus("error");
    } finally {
      setSaveStatus((status) => (status === "saving" ? "idle" : status));
    }
  }, [currentFileIdRef, draftRef, router, setDraft, setSaveError, setSaveStatus, user]);

  // Single-flight: the automatic run, Retry save and leaving for the dashboard can
  // all call this, and two concurrent runs create duplicate projects and files.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const saveDraftAfterLogin = useCallback(() => {
    inFlightRef.current ??= promote().finally(() => {
      inFlightRef.current = null;
    });
    return inFlightRef.current;
  }, [promote]);

  useEffect(() => {
    if (!draft || !user || savePending || promotionStartedRef.current) return;
    promotionStartedRef.current = true;
    void saveDraftAfterLogin();
  }, [draft, saveDraftAfterLogin, savePending, user]);

  return saveDraftAfterLogin;
}
