import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { env } from "@OpenDiagram/env/web";
import { saveGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import { writeLocalScene } from "@/lib/local-scene";
import { queueProjectFilePatch } from "@/lib/project-file-sync";
import { resetSceneDelta } from "@/lib/scene-delta";
import { type SavedProjectFile } from "@/lib/projects-client";
import type { WorkspaceSidebarFile } from "@/lib/workspace-layout-store";
import {
  AUTOSAVE_THROTTLE_MS,
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
        // Through the shared queue, so this coalesces with the spec and chat
        // history writes the agent fires against the same row (three requests per
        // diagram turn became one), and updateProjectFile below narrows the scene to
        // a delta. meta because everything read back below (updatedAt, and
        // id/name/type for toSidebarFile) is metadata;
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
        // and stamp the server's own updatedAt so the next open compares the
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
  /** The version the visibilitychange flush sent, so pagehide can skip it. */
  const hideFlushedVersionRef = useRef<string | null>(null);

  // Clearing the handle is the half that matters, not the clearTimeout.
  // scheduleAutosave treats a non-null handle as "an interval is already running"
  // and declines to arm another, so a cancelled timer left set would wedge
  // autosave for the rest of the session. Harmless under the old debounce, which
  // reassigned the handle unconditionally.
  const cancelPendingAutosave = useCallback(() => {
    if (!autosaveTimer.current) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = null;
  }, []);

  // Single-flight. Autosave used to fire on a bare timer, so drawing without
  // pausing put overlapping PATCHes on the wire with no ordering guarantee. Now a
  // save in progress leaves the newest snapshot queued and picks it up on
  // completion, collapsing a burst of edits into one request.
  //
  // Drains in a loop rather than calling itself back through a ref. The ref
  // version had to be reassigned on every render to stay current, and a write to
  // ref.current during render can leak out of work React discards.
  const runAutosave = useCallback(async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    try {
      // Stops draining once an interval is armed, or the throttle ceiling would
      // not hold: an edit arriving mid-request arms a timer AND queues a
      // snapshot, and draining that snapshot on completion puts a second PATCH
      // on the wire seconds after the first. Leaving it for the armed timer is
      // what keeps the rate at one per interval. The loop still runs when
      // nothing is armed, so a snapshot is never stranded.
      while (snapshotRef.current && !autosaveTimer.current) {
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
    const snapshot = snapshotCurrent();
    // Assigned before either guard below returns, so whichever save eventually runs
    // sends the newest state rather than the state that armed the timer.
    snapshotRef.current = snapshot;

    // The durable write happens here, not in the request. IndexedDB takes it in
    // about a millisecond, so the edit survives a refresh, a crash, or an offline
    // stretch the moment it is made. The PATCH below is replication, not saving.
    // That is what lets the interval grow without the user risking anything.
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

    // Excalidraw's LocalData.isSavePaused: a hidden tab replicates nothing.
    // The local write above already happened and the snapshot stays queued, so the
    // visibilitychange flush that fired alongside this picks it up.
    if (document.hidden) return;

    // Throttle, not debounce. Re-arming the timer on every change is what made a
    // 2500 ms delay fire on every pause in drawing instead of bounding the rate.
    // Bailing while one is pending caps this at one PATCH per interval no matter
    // how the edits arrive. Same shape as tldraw's TLLocalSyncClient.schedulePersist.
    if (autosaveTimer.current) return;
    autosaveTimer.current = setTimeout(() => {
      // Cleared before the run, not after: runAutosave awaits a request, and leaving
      // the handle set would swallow every edit made while it was in flight instead
      // of arming the next interval.
      autosaveTimer.current = null;
      void runAutosave();
    }, AUTOSAVE_THROTTLE_MS);
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

  // The two end-of-session signals, which do different things on purpose.
  //
  // visibilitychange -> hidden is the only one that fires when a tab is closed
  // from the mobile tab switcher or the browser is killed from the app switcher,
  // and with a 15 s interval instead of 2.5 s the window it covers is six times
  // wider. It runs the ordinary save: the page survives a tab switch, so the
  // response lands and the scene-delta bookkeeping stays in step with the server.
  //
  // pagehide is the last resort and cannot read a response, so it posts a full
  // snapshot outside the queue and drops the delta baseline (see below).
  useEffect(() => {
    function flushOnHide() {
      if (document.visibilityState !== "hidden") return;
      if (!isSignedInRef.current || !dirtyRef.current) return;
      cancelPendingAutosave();
      snapshotRef.current ??= snapshotCurrent();
      hideFlushedVersionRef.current = pendingVersionRef.current;
      void runAutosave();
    }
    document.addEventListener("visibilitychange", flushOnHide);
    return () => document.removeEventListener("visibilitychange", flushOnHide);
  }, [cancelPendingAutosave, runAutosave, snapshotCurrent]);

  useEffect(() => {
    function flush() {
      const file = activeFileRef.current;
      if (!isSignedInRef.current || !dirtyRef.current || !file) return;
      const snapshot = snapshotCurrent();
      if (!snapshot) return;
      // A navigation fires visibilitychange -> hidden and then pagehide, so without
      // this the same edit went out twice, and the full scene could land first and
      // leave the delta to 409 and retry over a newer write.
      if (hideFlushedVersionRef.current === snapshot.version) return;
      // Deliberately not through the queue: this fires on pagehide, where the page
      // may not live long enough to run another microtask. A direct keepalive fetch
      // is handed to the browser to finish after teardown. fields=meta because
      // nothing is left alive to read the response.
      //
      // A full scene, never a delta, and the baseline is dropped: the response
      // carrying the new sceneRev is never read, so a page restored from bfcache
      // would otherwise send its next delta against a revision the server has
      // already moved past.
      resetSceneDelta(snapshot.file.id);
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
      cancelPendingAutosave();
      snapshotRef.current = null;
      // Two empty files share a version string, so a stale value here would let
      // one file's hide-flush suppress another's pagehide save.
      hideFlushedVersionRef.current = null;
      sceneRef.current = type === "diagram" ? scene : null;
      contentRef.current = type === "doc" ? content : "";
      lastSavedVersionRef.current = initialElementsVersion(sceneRef.current);
      pendingVersionRef.current = lastSavedVersionRef.current;
      dirtyRef.current = false;
    },
    [saveSnapshot, snapshotCurrent],
  );

  const clearAutosave = useCallback(() => {
    cancelPendingAutosave();
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
