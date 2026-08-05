import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { env } from "@OpenDiagram/env/web";
import { saveGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import { writeLocalScene } from "@/lib/local-scene";
import { queueProjectFilePatch } from "@/lib/project-file-sync";
import { type SavedProjectFile } from "@/lib/projects-client";
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
        // Through the shared queue, so this coalesces with the `spec` and chat
        // history writes the agent fires against the same row -- three requests
        // per diagram turn became one. `"meta"` because everything read back
        // below (`updatedAt`, and `id/name/type` for `toSidebarFile`) is metadata;
        // the full form was shipping the scene back down on every autosave.
        const updated = await queueProjectFilePatch(
          projectId,
          snapshot.file.id,
          {
            scene: snapshot.file.type === "diagram" ? snapshot.scene : undefined,
            content: snapshot.file.type === "doc" ? snapshot.content : undefined,
          },
          "meta",
        );
        if (invalidatedFileIdsRef.current.has(snapshot.file.id)) return;
        if (snapshot.file.id === activeFileRef.current?.id) {
          lastSavedVersionRef.current = String(snapshot.version);
          if (snapshot.version === pendingVersionRef.current) dirtyRef.current = false;
          setSaveStatus("saved");
        }
        // Clear the local dirty flag only once the server has taken the write,
        // and stamp the server's own `updatedAt` so the next open compares the
        // two copies on the same clock rather than on this device's.
        void writeLocalScene({
          fileId: snapshot.file.id,
          projectId,
          type: snapshot.file.type,
          scene: snapshot.scene,
          content: snapshot.content,
          updatedAt: updated.updatedAt,
          dirty: false,
        });
        upsertStoredFile(toSidebarFile(updated));
      } catch {
        // The local copy stays dirty, so the edit is still on disk and will be
        // retried on the next change or recovered on the next open.
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

  const snapshotRef = useRef<SaveSnapshot | null>(null);
  const inFlightRef = useRef(false);

  // Single-flight. Autosave used to fire on a bare timer, so drawing without
  // pausing put overlapping PATCHes of the same file on the wire with no
  // ordering guarantee beyond whichever response happened to land last. Now a
  // save in progress simply leaves the newest snapshot queued and picks it up
  // on completion, which also collapses a burst of edits into one request.
  //
  // Drains in a loop rather than calling itself back through a ref. The ref
  // version had to be reassigned on every render to stay current, and a write
  // to `ref.current` during render can leak out of work React discards.
  const runAutosave = useCallback(async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    try {
      while (snapshotRef.current) {
        const snapshot = snapshotRef.current;
        snapshotRef.current = null;
        await saveSnapshot(snapshot);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [saveSnapshot]);

  const scheduleAutosave = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const snapshot = snapshotCurrent();
    snapshotRef.current = snapshot;

    // The durable write happens here, not in the request. IndexedDB takes it in
    // about a millisecond, so the edit survives a refresh, a crash or an offline
    // stretch the moment it is made; the PATCH below is replication, not saving.
    // That is what lets the debounce grow without the user risking anything.
    if (snapshot) {
      void writeLocalScene({
        fileId: snapshot.file.id,
        projectId,
        type: snapshot.file.type,
        scene: snapshot.scene,
        content: snapshot.content,
        updatedAt: new Date().toISOString(),
        dirty: true,
      });
    }

    autosaveTimer.current = setTimeout(() => void runAutosave(), AUTOSAVE_DELAY_MS);
  }, [projectId, runAutosave, setSaveStatus, snapshotCurrent]);

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
      // Deliberately not through the queue: this fires on `pagehide`, where the
      // page may not live long enough to run another microtask. A direct
      // `keepalive` fetch is handed to the browser to finish after teardown.
      // `fields=meta` because nothing is left alive to read the response.
      void fetch(
        `${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}/files/${snapshot.file.id}?fields=meta`,
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
