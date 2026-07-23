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
  const lastSavedVersionRef = useRef("");
  const pendingVersionRef = useRef("");
  const isSignedInRef = useRef(isSignedIn);
  activeFileRef.current = activeFile;
  isSignedInRef.current = isSignedIn;

  const invalidatedFileIdsRef = useRef(new Set<string>());
  type SaveSnapshot = {
    file: SavedProjectFile;
    version: string;
    scene: unknown;
    content: string;
  };
  const saveSnapshot = useCallback(
    async (snapshot: SaveSnapshot) => {
      if (invalidatedFileIdsRef.current.has(snapshot.file.id)) return;
      try {
        const updated = await updateProjectFile(projectId, snapshot.file.id, {
          scene: snapshot.file.type === "diagram" ? snapshot.scene : undefined,
          content: snapshot.file.type === "doc" ? snapshot.content : undefined,
        });
        if (invalidatedFileIdsRef.current.has(snapshot.file.id)) return;
        if (snapshot.file.id === activeFileRef.current?.id) {
          lastSavedVersionRef.current = String(snapshot.version);
          if (snapshot.version === pendingVersionRef.current) dirtyRef.current = false;
          setSaveStatus("saved");
        }
        upsertStoredFile(toSidebarFile(updated));
      } catch {
        if (snapshot.file.id === activeFileRef.current?.id) setSaveStatus("error");
      }
    },
    [projectId, setSaveStatus, upsertStoredFile],
  );

  const snapshotCurrent = useCallback((): SaveSnapshot | null => {
    const file = activeFileRef.current;
    if (!file) return null;
    return {
      file,
      version: pendingVersionRef.current,
      scene: sceneRef.current,
      content: contentRef.current,
    };
  }, []);

  const runAutosave = useCallback(async () => {
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    if (snapshot) await saveSnapshot(snapshot);
  }, [saveSnapshot]);
  const snapshotRef = useRef<SaveSnapshot | null>(null);

  const scheduleAutosave = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    snapshotRef.current = snapshotCurrent();
    autosaveTimer.current = setTimeout(() => void runAutosave(), AUTOSAVE_DELAY_MS);
  }, [runAutosave, setSaveStatus, snapshotCurrent]);

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
        pendingVersionRef.current = value;
        scheduleAutosave();
      }
    },
    [currentFileIdRef, draftRef, scheduleAutosave, setDocContent, setDraft],
  );

  useEffect(() => {
    function flush() {
      const file = activeFileRef.current;
      if (!isSignedInRef.current || !dirtyRef.current || !file) return;
      const snapshot = snapshotCurrent();
      if (!snapshot) return;
      void fetch(
        `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files/${snapshot.file.id}`,
        {
          method: "PATCH",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scene: snapshot.file.type === "diagram" ? snapshot.scene : undefined,
            content: snapshot.file.type === "doc" ? snapshot.content : undefined,
          }),
        },
      );
    }
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [projectId]);

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      if (dirtyRef.current) {
        const snapshot = snapshotRef.current ?? snapshotCurrent();
        if (snapshot) void saveSnapshot(snapshot);
      }
    },
    [],
  );

  const initialize = useCallback(
    (type: SavedProjectFile["type"], scene: unknown, content: string) => {
      if (dirtyRef.current) {
        const snapshot = snapshotRef.current ?? snapshotCurrent();
        if (snapshot) void saveSnapshot(snapshot);
      }
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      snapshotRef.current = null;
      sceneRef.current = type === "diagram" ? scene : null;
      contentRef.current = type === "doc" ? content : "";
      lastSavedVersionRef.current = initialElementsVersion(sceneRef.current);
      pendingVersionRef.current = lastSavedVersionRef.current;
      dirtyRef.current = false;
    },
    [saveSnapshot, snapshotCurrent],
  );

  const clearAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    snapshotRef.current = null;
  }, []);
  const invalidateFileAutosave = useCallback((fileId: string) => {
    invalidatedFileIdsRef.current.add(fileId);
    if (snapshotRef.current?.file.id === fileId) snapshotRef.current = null;
  }, []);
  const restoreFileAutosave = useCallback((fileId: string) => {
    invalidatedFileIdsRef.current.delete(fileId);
  }, []);
  const markClean = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  return {
    activeFileRef,
    clearAutosave,
    invalidateFileAutosave,
    restoreFileAutosave,
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
