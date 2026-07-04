"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useParams, useRouter } from "next/navigation";
import { AIChatPanel } from "./AIChatPanel";
import { Whiteboard } from "./Whiteboard";
import { authClient } from "@/lib/auth-client";
import {
  deleteGuestProjectDraft,
  getGuestProjectDraft,
  saveGuestProjectDraft,
  type GuestProjectDraft,
} from "@/lib/guest-drafts";
import {
  createProject,
  createProjectFile,
  getProjectFile,
  listProjectFiles,
  updateProjectFile,
  type SavedProjectFile,
} from "@/lib/projects-client";

function sanitizeSceneAppState(appState: unknown) {
  if (!appState || typeof appState !== "object") return appState;

  const { collaborators: _collaborators, ...rest } = appState as Record<string, unknown>;

  return rest;
}

export function WorkspaceLayout() {
  const params = useParams<{ projectId: string; workspaceId?: string }>();
  const router = useRouter();
  const session = authClient.useSession();
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [draft, setDraft] = useState<GuestProjectDraft | null>(null);
  const [activeFile, setActiveFile] = useState<SavedProjectFile | null>(null);
  const [initialScene, setInitialScene] = useState<unknown>(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [showFirstFileDialog, setShowFirstFileDialog] = useState(false);
  const [firstFileName, setFirstFileName] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const draftRef = useRef<GuestProjectDraft | null>(null);
  const sceneRef = useRef<unknown>(null);
  const currentFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextDraft = getGuestProjectDraft(params.projectId);
    draftRef.current = nextDraft;
    setDraft(nextDraft);

    if (nextDraft) {
      const file = params.workspaceId
        ? nextDraft.files.find((f) => f.id === params.workspaceId)
        : nextDraft.files[0];
      currentFileIdRef.current = file?.id ?? nextDraft.files[0]?.id ?? null;
      setInitialScene(file?.scene ?? null);
    } else {
      currentFileIdRef.current = null;
      setInitialScene(null);
    }
  }, [params.projectId, params.workspaceId]);

  useEffect(() => {
    if (!draft || session.data?.user) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draft, session.data?.user]);

  useEffect(() => {
    if (session.isPending || !session.data?.user || draftRef.current) return;

    let active = true;

    async function loadActiveFile() {
      setSaveError(null);

      try {
        let result: SavedProjectFile;

        if (params.workspaceId) {
          result = await getProjectFile(params.projectId, params.workspaceId);
        } else {
          const files = await listProjectFiles(params.projectId);
          const diagramFile = files.find((f) => f.type === "diagram");

          if (!diagramFile) {
            if (active) {
              setShowFirstFileDialog(true);
              setFirstFileName("");
            }
            return;
          }

          result = await getProjectFile(params.projectId, diagramFile.id);
        }

        if (active) {
          setActiveFile(result);
          sceneRef.current = result.scene ?? null;
          setInitialScene(result.scene ?? null);
        }
      } catch (err) {
        if (active) {
          setSaveError(err instanceof Error ? err.message : "Could not load project file.");
        }
      }
    }

    void loadActiveFile();

    return () => {
      active = false;
    };
  }, [draft, params.projectId, params.workspaceId, session.data?.user, session.isPending]);

  const saveDraftAfterLogin = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;

    if (!session.data?.user) {
      setLeavePromptOpen(true);
      return;
    }

    setSavePending(true);
    setSaveError(null);

    try {
      const currentFile =
        currentDraft.files.find((f) => f.id === currentFileIdRef.current) ?? currentDraft.files[0];
      if (!currentFile) {
        setSaveError("No file to save.");
        return;
      }

      const project = await createProject({
        name: currentDraft.name,
        description: currentDraft.description,
      });
      const file = await createProjectFile(project.id, {
        name: currentFile.name,
        type: "diagram",
        scene: currentFile.scene,
        spec: currentFile.spec,
      });

      deleteGuestProjectDraft(currentDraft.id);
      draftRef.current = null;
      setDraft(null);
      router.replace(`/project/${project.id}/workspace/${file.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save project.");
    } finally {
      setSavePending(false);
    }
  }, [router, session.data?.user]);

  useEffect(() => {
    if (!draft || !session.data?.user || savePending) return;

    void saveDraftAfterLogin();
  }, [draft, saveDraftAfterLogin, savePending, session.data?.user]);

  const updateGuestDraft = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      const scene = { elements, appState: sanitizeSceneAppState(appState), files };

      sceneRef.current = scene;

      const currentDraft = draftRef.current;
      if (!currentDraft || session.data?.user) return;

      const fileId = currentFileIdRef.current ?? currentDraft.files[0]?.id;
      if (!fileId) return;

      const nextDraft = {
        ...currentDraft,
        files: currentDraft.files.map((f) => (f.id === fileId ? { ...f, scene } : f)),
      };

      draftRef.current = nextDraft;
      saveGuestProjectDraft(nextDraft);
    },
    [session.data?.user],
  );

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    setExcalidrawAPI((currentAPI) => (currentAPI === api ? currentAPI : api));
  }, []);

  useEffect(() => {
    if (!excalidrawAPI) return;

    if (!initialScene || typeof initialScene !== "object") {
      excalidrawAPI.updateScene({ elements: [], appState: undefined });
      return;
    }

    const scene = initialScene as { elements?: unknown; appState?: unknown; files?: unknown };
    const appState = sanitizeSceneAppState(scene.appState);

    excalidrawAPI.updateScene({
      elements: Array.isArray(scene.elements) ? scene.elements : [],
      appState: appState && typeof appState === "object" ? appState : undefined,
    });

    if (scene.files && typeof scene.files === "object") {
      excalidrawAPI.addFiles(Object.values(scene.files));
    }
  }, [excalidrawAPI, initialScene]);

  async function saveActiveFile() {
    if (!session.data?.user) {
      await saveDraftAfterLogin();
      return;
    }

    if (!activeFile) {
      setSaveError("Project file is still loading.");
      return;
    }

    setSavePending(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const file = await updateProjectFile(params.projectId, activeFile.id, {
        scene: sceneRef.current,
      });

      setActiveFile(file);
      setSaveMessage("Saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save canvas.");
    } finally {
      setSavePending(false);
    }
  }

  async function handleCreateFirstFile(event: React.FormEvent) {
    event.preventDefault();
    const name = firstFileName.trim() || "Untitled diagram";

    try {
      const file = await createProjectFile(params.projectId, {
        name,
        type: "diagram",
      });
      setShowFirstFileDialog(false);
      setActiveFile(file);
      sceneRef.current = null;
      setInitialScene(null);
      router.replace(`/project/${params.projectId}/workspace/${file.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not create file.");
    }
  }

  async function signInToSave() {
    await authClient.signIn.social({
      provider: "github",
      scopes: ["repo"],
      callbackURL: window.location.href,
    });
  }

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 min-w-0">
        <Whiteboard
          initialScene={initialScene}
          onAPIReady={handleExcalidrawAPI}
          onSceneChange={updateGuestDraft}
        />
      </div>
      <div className="w-96 shrink-0">
        {(draft || session.data?.user) && (
          <div className="border-b border-od-border-soft bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-od-ink">
                  {draft?.name ?? activeFile?.name ?? "Untitled diagram"}
                </p>
                <p className="truncate text-[12px] text-od-ink-faint">
                  {session.data?.user ? "Saved project file" : "Guest draft"}
                </p>
              </div>
              <button
                type="button"
                onClick={saveActiveFile}
                disabled={savePending}
                className="h-8 rounded-[8px] bg-od-ink px-3 text-[12px] font-medium text-white disabled:cursor-wait disabled:opacity-70"
              >
                {savePending ? "Saving..." : "Save"}
              </button>
            </div>
            {saveMessage && <p className="mt-2 text-[12px] text-od-green">{saveMessage}</p>}
            {saveError && <p className="mt-2 text-[12px] text-red-600">{saveError}</p>}
          </div>
        )}
        <AIChatPanel
          excalidrawAPI={excalidrawAPI}
          projectId={session.data?.user ? params.projectId : undefined}
          fileId={activeFile?.id ?? currentFileIdRef.current ?? undefined}
          initialHistory={
            activeFile?.history as
              | { id: string; role: "user" | "assistant"; text: string }[]
              | undefined
          }
        />
      </div>
      {showFirstFileDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 px-4">
          <div className="w-full max-w-[420px] rounded-[18px] border border-od-border-soft bg-white p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.55)]">
            <h2 className="text-[18px] font-semibold text-od-ink">Name your file</h2>
            <form onSubmit={handleCreateFirstFile} className="mt-4 grid gap-4">
              <input
                autoFocus
                value={firstFileName}
                onChange={(event) => setFirstFileName(event.target.value)}
                placeholder="e.g. Checkout architecture"
                className="h-11 rounded-[8px] border border-od-border-soft px-3 text-[14px] text-od-ink outline-none transition placeholder:text-od-ink-faint focus:border-od-ink"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowFirstFileDialog(false);
                    router.push("/dashboard");
                  }}
                  className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink"
                >
                  Go to dashboard
                </button>
                <button
                  type="submit"
                  className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-white"
                >
                  Create file
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {leavePromptOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 px-4">
          <div className="w-full max-w-[420px] rounded-[18px] border border-od-border-soft bg-white p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.55)]">
            <h2 className="text-[18px] font-semibold text-od-ink">You&apos;ll lose your work</h2>
            <p className="mt-2 text-[14px] leading-6 text-od-ink-muted">
              Sign in to save this guest draft to your workspace before leaving.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLeavePromptOpen(false)}
                className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={signInToSave}
                className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-white"
              >
                Login / Sign up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
