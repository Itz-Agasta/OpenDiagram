"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { env } from "@OpenDiagram/env/web";
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

const AUTOSAVE_DELAY_MS = 800;

type SaveStatus = "idle" | "saving" | "saved" | "error";

function sanitizeSceneAppState(appState: unknown) {
  if (!appState || typeof appState !== "object") return appState;

  const { collaborators: _collaborators, ...rest } = appState as Record<string, unknown>;

  return rest;
}

// Cheap change signal (sum of element `version`s, same idea as Excalidraw's
// getSceneVersion). Excalidraw fires onChange on every render — without this we
// autosave in an infinite loop even when the drawing hasn't actually changed.
function sceneElementsVersion(elements: readonly unknown[]) {
  let version = 0;
  for (const element of elements) {
    if (element && typeof element === "object" && "version" in element) {
      const value = (element as { version?: unknown }).version;
      if (typeof value === "number") version += value;
    }
  }
  return version;
}

function initialElementsVersion(scene: unknown) {
  const elements = (scene as { elements?: unknown })?.elements;
  return Array.isArray(elements) ? sceneElementsVersion(elements) : 0;
}

export function WorkspaceLayout() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileIdParam = searchParams.get("file");
  const session = authClient.useSession();
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [draft, setDraft] = useState<GuestProjectDraft | null>(null);
  const [activeFile, setActiveFile] = useState<SavedProjectFile | null>(null);
  const [initialScene, setInitialScene] = useState<unknown>(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const draftRef = useRef<GuestProjectDraft | null>(null);
  const sceneRef = useRef<unknown>(null);
  const activeFileRef = useRef<SavedProjectFile | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const promotionStartedRef = useRef(false);
  const lastSavedVersionRef = useRef(0);
  const pendingVersionRef = useRef(0);
  const skipCommitRef = useRef(false);

  const isSignedIn = Boolean(session.data?.user);
  // Kept in a ref so the (frequently called) Excalidraw onChange handler reads
  // the latest auth state without being re-created on every render.
  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    const nextDraft = getGuestProjectDraft(params.projectId);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setInitialScene(nextDraft?.scene ?? null);
    lastSavedVersionRef.current = initialElementsVersion(nextDraft?.scene);
  }, [params.projectId]);

  // Guest hard-exit guard (tab close / refresh).
  useEffect(() => {
    if (!draft || isSignedIn) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draft, isSignedIn]);

  // Guest in-app back-navigation guard: intercept the browser back button and
  // show the "you'll lose your work" prompt instead of silently leaving.
  useEffect(() => {
    if (!draft || isSignedIn) return;

    window.history.pushState(null, "", window.location.href);

    function onPopState() {
      window.history.pushState(null, "", window.location.href);
      setLeavePromptOpen(true);
    }

    window.addEventListener("popstate", onPopState);

    return () => window.removeEventListener("popstate", onPopState);
  }, [draft, isSignedIn]);

  useEffect(() => {
    if (session.isPending || !isSignedIn || draftRef.current) return;

    let active = true;

    async function loadActiveFile() {
      setSaveError(null);

      try {
        const files = await listProjectFiles(params.projectId);
        const target =
          (fileIdParam ? files.find((file) => file.id === fileIdParam) : undefined) ??
          files.find((file) => file.type === "diagram");
        // The list endpoint omits `scene`; fetch the full file so the canvas
        // reloads its saved content (or create the first diagram file).
        const diagramFile = target
          ? await getProjectFile(params.projectId, target.id)
          : await createProjectFile(params.projectId, {
              name: "Your first design",
              type: "diagram",
            });

        if (active) {
          setActiveFile(diagramFile);
          sceneRef.current = diagramFile.scene ?? null;
          setInitialScene(diagramFile.scene ?? null);
          lastSavedVersionRef.current = initialElementsVersion(diagramFile.scene);
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
  }, [draft, fileIdParam, params.projectId, isSignedIn, session.isPending]);

  const saveDraftAfterLogin = useCallback(async () => {
    const currentDraft = draftRef.current;
    if (!currentDraft || !session.data?.user) return;

    setSavePending(true);
    setSaveError(null);

    try {
      const project = await createProject({
        name: currentDraft.name,
        description: currentDraft.description,
      });
      await createProjectFile(project.id, {
        name: "Your first design",
        type: "diagram",
        scene: currentDraft.scene,
        spec: currentDraft.spec,
      });

      deleteGuestProjectDraft(currentDraft.id);
      draftRef.current = null;
      setDraft(null);
      router.replace(`/workspace/${project.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save project.");
    } finally {
      setSavePending(false);
    }
  }, [router, session.data?.user]);

  // After a guest returns signed-in, promote their local draft to a saved project.
  useEffect(() => {
    if (!draft || !session.data?.user || savePending || promotionStartedRef.current) return;

    promotionStartedRef.current = true;
    void saveDraftAfterLogin();
  }, [draft, saveDraftAfterLogin, savePending, session.data?.user]);

  const runAutosave = useCallback(async () => {
    const file = activeFileRef.current;
    if (!file) return;

    const versionAtSave = pendingVersionRef.current;

    try {
      await updateProjectFile(params.projectId, file.id, { scene: sceneRef.current });
      lastSavedVersionRef.current = versionAtSave;
      dirtyRef.current = false;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [params.projectId]);

  const scheduleAutosave = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus("saving");

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void runAutosave(), AUTOSAVE_DELAY_MS);
  }, [runAutosave]);

  const handleSceneChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      // Ignore onChange fires that don't actually change the drawing (Excalidraw
      // emits on every render); otherwise autosave loops forever.
      const version = sceneElementsVersion(elements);
      if (version === lastSavedVersionRef.current) return;

      const scene = { elements, appState: sanitizeSceneAppState(appState), files };
      sceneRef.current = scene;

      const currentDraft = draftRef.current;
      if (currentDraft && !isSignedInRef.current) {
        lastSavedVersionRef.current = version;
        draftRef.current = { ...currentDraft, scene };
        saveGuestProjectDraft(draftRef.current);
        return;
      }

      if (isSignedInRef.current && activeFileRef.current) {
        pendingVersionRef.current = version;
        scheduleAutosave();
      }
    },
    [scheduleAutosave],
  );

  // Flush pending edits on tab-close / navigate so nothing in the debounce
  // window is lost (keepalive lets the request outlive the page).
  useEffect(() => {
    function flush() {
      if (!isSignedInRef.current || !dirtyRef.current) return;

      const file = activeFileRef.current;
      if (!file) return;

      fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${params.projectId}/files/${file.id}`, {
        method: "PATCH",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: sceneRef.current }),
      }).catch(() => {});
    }

    window.addEventListener("pagehide", flush);

    return () => window.removeEventListener("pagehide", flush);
  }, [params.projectId]);

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    [],
  );

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    setExcalidrawAPI((currentAPI) => (currentAPI === api ? currentAPI : api));
  }, []);

  useEffect(() => {
    if (!excalidrawAPI || !initialScene || typeof initialScene !== "object") return;

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

  function goToLogin() {
    const redirect = encodeURIComponent(window.location.pathname);
    router.push(`/login?redirect=${redirect}`);
  }

  // Inline rename of the file name (tap the title to edit). Project name is not
  // editable here — that lives on the dashboard.
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
      if (name === currentDraft.name) return;
      const nextDraft = { ...currentDraft, name };
      draftRef.current = nextDraft;
      saveGuestProjectDraft(nextDraft);
      setDraft(nextDraft);
      return;
    }

    if (activeFile && name !== activeFile.name) {
      try {
        const updated = await updateProjectFile(params.projectId, activeFile.id, { name });
        setActiveFile(updated);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Could not rename file.");
      }
    }
  }

  function leaveWithoutSaving() {
    // Guest chose not to sign in — discard the local draft (project + diagram).
    const currentDraft = draftRef.current;
    if (currentDraft) {
      deleteGuestProjectDraft(currentDraft.id);
      draftRef.current = null;
      setDraft(null);
    }
    setLeavePromptOpen(false);
    router.push("/dashboard");
  }

  const saveIndicator = !isSignedIn
    ? { dot: "bg-od-ink-faint", label: "Guest" }
    : saveStatus === "saving"
      ? { dot: "bg-amber-500", label: "Saving…" }
      : saveStatus === "error"
        ? { dot: "bg-red-500", label: "Save failed" }
        : { dot: "bg-od-green", label: "Saved" };

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 min-w-0">
        <Whiteboard
          initialScene={initialScene}
          onAPIReady={handleExcalidrawAPI}
          onSceneChange={handleSceneChange}
        />
      </div>
      <div className="flex h-full w-96 shrink-0 flex-col">
        {(draft || isSignedIn) && (
          <div className="shrink-0 border-b border-od-border-soft bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                {isEditingName ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={() => void commitName()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      else if (event.key === "Escape") cancelName();
                    }}
                    className="w-full rounded-[6px] border border-od-border-soft px-1.5 py-1 text-[14px] font-medium text-od-ink outline-none focus:border-od-ink"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={beginEditName}
                    title="Rename file"
                    className="-mx-1.5 block max-w-full truncate rounded-[6px] px-1.5 py-1 text-left text-[14px] font-medium text-od-ink transition hover:bg-od-canvas/40"
                  >
                    {activeFile?.name ?? draft?.name ?? "Your first design"}
                  </button>
                )}
              </div>
              <span
                className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-od-ink-faint"
                title={saveError ?? undefined}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${saveIndicator.dot}`} />
                {saveIndicator.label}
              </span>
              {!isSignedIn && (
                <button
                  type="button"
                  onClick={goToLogin}
                  className="h-8 shrink-0 rounded-[8px] bg-od-ink px-3 text-[12px] font-medium text-white"
                >
                  Sign in to save
                </button>
              )}
            </div>
            {saveError && <p className="mt-1.5 truncate text-[11px] text-red-600">{saveError}</p>}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <AIChatPanel excalidrawAPI={excalidrawAPI} />
        </div>
      </div>
      {leavePromptOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/25 px-4"
          onClick={() => setLeavePromptOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-[18px] border border-od-border-soft bg-white p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-[18px] font-semibold text-od-ink">You&apos;ll lose your work</h2>
            <p className="mt-2 text-[14px] leading-6 text-od-ink-muted">
              This project is only on this device. Sign in to save it to your workspace, or leave to
              discard it.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={leaveWithoutSaving}
                className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink-muted hover:text-od-ink"
              >
                Leave without saving
              </button>
              <button
                type="button"
                onClick={goToLogin}
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
