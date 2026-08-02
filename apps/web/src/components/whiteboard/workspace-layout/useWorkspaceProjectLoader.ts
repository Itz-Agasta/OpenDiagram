import { useEffect, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { getGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import type { StoredChatMessage } from "@/lib/chat-history";
import { readLocalChat } from "@/lib/local-chat";
import { readLocalScene, writeLocalScene } from "@/lib/local-scene";
import {
  getProject,
  getProjectFile,
  listProjectFiles,
  type SavedProject,
  type SavedProjectFile,
} from "@/lib/projects-client";
import type { useWorkspaceLayoutStore } from "@/lib/workspace-layout-store";
import { fileContentToText, toSidebarFile } from "./helpers";

type ProjectSnapshot = Parameters<
  ReturnType<typeof useWorkspaceLayoutStore.getState>["setProjectSnapshot"]
>[0];

interface LoaderOptions {
  currentFileIdRef: RefObject<string | null>;
  draft: GuestProjectDraft | null;
  draftRef: RefObject<GuestProjectDraft | null>;
  initializePersistence: (type: SavedProjectFile["type"], scene: unknown, content: string) => void;
  isSignedIn: boolean;
  projectId: string;
  sessionPending: boolean;
  setActiveFile: Dispatch<SetStateAction<SavedProjectFile | null>>;
  setDocContent: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<GuestProjectDraft | null>>;
  setFileLoading: Dispatch<SetStateAction<boolean>>;
  setFirstFileName: Dispatch<SetStateAction<string>>;
  setInitialScene: Dispatch<SetStateAction<unknown>>;
  setLocalFileType: Dispatch<SetStateAction<SavedProjectFile["type"] | null>>;
  setLocalHistory: Dispatch<SetStateAction<StoredChatMessage[] | null>>;
  setProject: Dispatch<SetStateAction<SavedProject | null>>;
  setProjectSnapshot: (snapshot: ProjectSnapshot) => void;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setShowFirstFileDialog: Dispatch<SetStateAction<boolean>>;
  workspaceId?: string;
}

export function useWorkspaceProjectLoader(options: LoaderOptions) {
  const {
    currentFileIdRef,
    draft,
    draftRef,
    initializePersistence,
    isSignedIn,
    projectId,
    sessionPending,
    setActiveFile,
    setDocContent,
    setDraft,
    setFileLoading,
    setFirstFileName,
    setInitialScene,
    setLocalFileType,
    setLocalHistory,
    setProject,
    setProjectSnapshot,
    setSaveError,
    setShowFirstFileDialog,
    workspaceId,
  } = options;

  // Guest drafts became durable, so reading one is a trip to IndexedDB rather
  // than a Map lookup. That makes this effect async, and `draftRef.current` is no
  // longer populated by the time the signed-in loader below first runs -- which
  // reads it to decide whether a project is a local draft or a server project.
  // This flag holds that loader until the answer exists; without it a signed-in
  // user opening a draft they had not promoted yet would race into a 404.
  const [draftResolved, setDraftResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const nextDraft = await getGuestProjectDraft(projectId);
      if (cancelled) return;

      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setDraftResolved(true);

      if (!nextDraft) {
        currentFileIdRef.current = null;
        setInitialScene(null);
        return;
      }

      setProject(null);
      const file = workspaceId
        ? nextDraft.files.find((item) => item.id === workspaceId)
        : nextDraft.files[0];
      currentFileIdRef.current = file?.id ?? nextDraft.files[0]?.id ?? null;
      const type = file?.type ?? "diagram";
      const now = new Date().toISOString();
      setActiveFile(
        file
          ? {
              id: file.id,
              projectId: nextDraft.id,
              type,
              name: file.name,
              scene: file.scene,
              spec: file.spec,
              content: file.content,
              history: file.history ?? [],
              createdAt: now,
              updatedAt: now,
            }
          : null,
      );
      setProjectSnapshot({
        projectId: nextDraft.id,
        projectName: nextDraft.name,
        files: nextDraft.files.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type ?? "diagram",
        })),
        activeFileId: currentFileIdRef.current,
      });
      const content = type === "doc" ? fileContentToText(file?.content) : "";
      const scene = type === "diagram" ? (file?.scene ?? null) : null;
      initializePersistence(type, scene, content);
      setDocContent(content);
      setInitialScene(scene);
      setFileLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentFileIdRef,
    draftRef,
    initializePersistence,
    projectId,
    setActiveFile,
    setDocContent,
    setDraft,
    setFileLoading,
    setInitialScene,
    setProject,
    setProjectSnapshot,
    workspaceId,
  ]);

  useEffect(() => {
    if (!draftResolved || sessionPending || !isSignedIn || draftRef.current) return;
    let active = true;

    async function loadActiveFile() {
      setSaveError(null);
      setFileLoading(true);
      // Dropped before the cache read below, not after: this effect reruns on file
      // switch, and until the new file's entry is read the previous file's
      // transcript is still in state. Leaving it there would show one file's
      // conversation next to another file's canvas.
      setLocalHistory(null);
      setLocalFileType(null);

      // Local-first paint. When the workspace URL already names a file -- which
      // it does for every navigation out of the dashboard -- IndexedDB can
      // answer before the network is even asked, so the canvas fills in about a
      // millisecond instead of waiting out three sequential request waves. The
      // fetch below still runs and still wins if the server copy is newer; this
      // only removes the blank screen in front of it.
      if (workspaceId) {
        const [local, localChat] = await Promise.all([
          readLocalScene(workspaceId),
          readLocalChat(workspaceId),
        ]);
        if (!active) return;
        if (local) {
          const scene = local.type === "diagram" ? (local.scene ?? null) : null;
          initializePersistence(local.type, scene, local.content);
          setDocContent(local.content);
          setInitialScene(scene);
          // The chat panel branches on file type (a diagram file drives the
          // canvas agent, a doc file the project agent), so without this it
          // would have to wait for `activeFile` to know which chat it even is --
          // which is the wait the cache exists to remove.
          setLocalFileType(local.type);
          currentFileIdRef.current = workspaceId;
          setFileLoading(false);
        }
        // The chat transcript gets the same treatment the canvas already had. It
        // is set independently of `local` above: a file can have a cached
        // conversation without a cached scene (the agent drew, the scene write
        // had not landed yet), and the panel should still fill in.
        if (localChat) setLocalHistory(localChat.messages);
      }

      try {
        const [project, files] = await Promise.all([
          getProject(projectId),
          listProjectFiles(projectId),
        ]);
        const firstFile = files[0];
        if (!workspaceId && !firstFile) {
          if (active) {
            setProject(project);
            setProjectSnapshot({
              projectId: project.id,
              projectName: project.name,
              files: [],
              activeFileId: null,
            });
            setShowFirstFileDialog(true);
            setFirstFileName("");
          }
          return;
        }
        const result = await getProjectFile(projectId, workspaceId ?? firstFile!.id);
        if (!active) return;
        setProject(project);
        setActiveFile(result);
        setProjectSnapshot({
          projectId: project.id,
          projectName: project.name,
          files: files.map(toSidebarFile),
          activeFileId: result.id,
        });
        currentFileIdRef.current = result.id;

        // Reconcile local against server. A local copy still flagged dirty means
        // edits never reached the server -- an offline stretch, a failed PATCH, a
        // tab closed mid-save -- so it wins. Deliberately keyed on the flag and
        // not on a timestamp comparison: `updatedAt` on the local side comes from
        // the device clock and on the server side from Postgres, and a skewed
        // laptop clock must never be able to discard work the user can see.
        //
        // Last-writer-wins, with the tie going to unsaved local work. If another
        // device edited the same file while this one held unsynced changes, this
        // one overwrites it -- acceptable for a single-user document, and the
        // alternative is silently throwing away edits the user made.
        const local = await readLocalScene(result.id);
        if (!active) return;
        const keepLocal = local?.dirty === true;

        const serverScene = result.type === "diagram" ? (result.scene ?? null) : null;
        const serverContent = result.type === "doc" ? fileContentToText(result.content) : "";
        const scene = keepLocal
          ? local.type === "diagram"
            ? (local.scene ?? null)
            : null
          : serverScene;
        const content = keepLocal ? local.content : serverContent;

        initializePersistence(result.type, scene, content);
        setDocContent(content);
        setInitialScene(scene);

        // Seed the local copy when the server won, so the next open of this file
        // paints from disk even on a device that has never edited it.
        if (!keepLocal) {
          void writeLocalScene({
            fileId: result.id,
            projectId,
            type: result.type,
            scene: serverScene,
            content: serverContent,
            updatedAt: result.updatedAt,
            dirty: false,
          });
        }
      } catch (error) {
        if (active)
          setSaveError(error instanceof Error ? error.message : "Could not load project file.");
      } finally {
        if (active) setFileLoading(false);
      }
    }

    void loadActiveFile();
    return () => {
      active = false;
    };
  }, [
    currentFileIdRef,
    draft,
    draftRef,
    draftResolved,
    initializePersistence,
    isSignedIn,
    projectId,
    sessionPending,
    setActiveFile,
    setDocContent,
    setFileLoading,
    setFirstFileName,
    setInitialScene,
    setLocalFileType,
    setLocalHistory,
    setProject,
    setProjectSnapshot,
    setSaveError,
    setShowFirstFileDialog,
    workspaceId,
  ]);
}
