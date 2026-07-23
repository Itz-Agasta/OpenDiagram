import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { env } from "@OpenDiagram/env/web";
import { saveGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import { updateProjectFile, type SavedProjectFile } from "@/lib/projects-client";
import type { WorkspaceSidebarFile } from "@/lib/workspace-layout-store";
import {
  AUTOSAVE_DELAY_MS,
  initialElementsVersion,
  sanitizeSceneAppState,
  sceneElementsVersion,
  toSidebarFile,
  type SaveStatus,
} from "./helpers";

interface UseWorkspacePersistenceOptions {
  activeFile: SavedProjectFile | null;
  currentFileIdRef: RefObject<string | null>;
  draftRef: RefObject<GuestProjectDraft | null>;
  isSignedIn: boolean;
  projectId: string;
  setDocContent: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<GuestProjectDraft | null>>;
  setSaveStatus: Dispatch<SetStateAction<SaveStatus>>;
  upsertStoredFile: (file: WorkspaceSidebarFile) => void;
}

export function useWorkspacePersistence(options: UseWorkspacePersistenceOptions) {
  const {
    activeFile,
    currentFileIdRef,
    draftRef,
    isSignedIn,
    projectId,
    setDocContent,
    setDraft,
    setSaveStatus,
    upsertStoredFile,
  } = options;
  const activeFileRef = useRef(activeFile);
  const sceneRef = useRef<unknown>(null);
  const contentRef = useRef("");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const lastSavedVersionRef = useRef(0);
  const pendingVersionRef = useRef(0);
  const isSignedInRef = useRef(isSignedIn);
  activeFileRef.current = activeFile;
  isSignedInRef.current = isSignedIn;

  const runAutosave = useCallback(async () => {
    const file = activeFileRef.current;
    if (!file) return;
    const versionAtSave = pendingVersionRef.current;
    try {
      const updated = await updateProjectFile(projectId, file.id, {
        scene: file.type === "diagram" ? sceneRef.current : undefined,
        content: file.type === "doc" ? contentRef.current : undefined,
      });
      if (file.type === "diagram") lastSavedVersionRef.current = versionAtSave;
      if (versionAtSave === pendingVersionRef.current) dirtyRef.current = false;
      setSaveStatus("saved");
      upsertStoredFile(toSidebarFile(updated));
    } catch {
      setSaveStatus("error");
    }
  }, [projectId, setSaveStatus, upsertStoredFile]);

  const scheduleAutosave = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void runAutosave(), AUTOSAVE_DELAY_MS);
  }, [runAutosave, setSaveStatus]);

  const handleSceneChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      const version = sceneElementsVersion(elements);
      if (version === lastSavedVersionRef.current) return;
      const scene = { elements, appState: sanitizeSceneAppState(appState), files };
      sceneRef.current = scene;

      const currentDraft = draftRef.current;
      if (currentDraft && !isSignedInRef.current) {
        lastSavedVersionRef.current = version;
        updateGuestDraft(currentDraft, currentFileIdRef.current, { scene }, draftRef, setDraft);
      } else if (activeFileRef.current?.type === "diagram" && isSignedInRef.current) {
        pendingVersionRef.current = version;
        scheduleAutosave();
      }
    },
    [currentFileIdRef, draftRef, scheduleAutosave, setDraft],
  );

  const handleDocChange = useCallback(
    (value: string) => {
      if (contentRef.current === value) return;
      contentRef.current = value;
      setDocContent(value);
      const currentDraft = draftRef.current;
      if (currentDraft && !isSignedInRef.current) {
        updateGuestDraft(
          currentDraft,
          currentFileIdRef.current,
          { content: value },
          draftRef,
          setDraft,
        );
      } else if (activeFileRef.current?.type === "doc" && isSignedInRef.current) {
        pendingVersionRef.current += 1;
        scheduleAutosave();
      }
    },
    [currentFileIdRef, draftRef, scheduleAutosave, setDocContent, setDraft],
  );

  useEffect(() => {
    function flush() {
      const file = activeFileRef.current;
      if (!isSignedInRef.current || !dirtyRef.current || !file) return;
      void fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files/${file.id}`, {
        method: "PATCH",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: file.type === "diagram" ? sceneRef.current : undefined,
          content: file.type === "doc" ? contentRef.current : undefined,
        }),
      });
    }
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [projectId]);

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    [],
  );

  const initialize = useCallback(
    (type: SavedProjectFile["type"], scene: unknown, content: string) => {
      sceneRef.current = type === "diagram" ? scene : null;
      contentRef.current = type === "doc" ? content : "";
      lastSavedVersionRef.current = initialElementsVersion(sceneRef.current);
      dirtyRef.current = false;
    },
    [],
  );

  const clearAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
  }, []);
  const markClean = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  return {
    activeFileRef,
    clearAutosave,
    contentRef,
    handleDocChange,
    handleSceneChange,
    initialize,
    markClean,
    sceneRef,
  };
}

function updateGuestDraft(
  draft: GuestProjectDraft,
  currentFileId: string | null,
  update: { scene?: unknown; content?: string },
  draftRef: RefObject<GuestProjectDraft | null>,
  setDraft: Dispatch<SetStateAction<GuestProjectDraft | null>>,
) {
  const fileId = currentFileId ?? draft.files[0]?.id;
  if (!fileId) return;
  const nextDraft = {
    ...draft,
    files: draft.files.map((file) => (file.id === fileId ? { ...file, ...update } : file)),
  };
  draftRef.current = nextDraft;
  saveGuestProjectDraft(nextDraft);
  setDraft(nextDraft);
}
