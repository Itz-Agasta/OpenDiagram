import { useCallback, useEffect, useRef } from "react";
import { queueProjectFilePatch } from "#/lib/api";
import { sanitizeSceneAppState, sceneElementsVersion } from "#/lib/utils/excalidraw-utils";
import type { AppliedScene } from "./useApplyDrawDiagram";

const SCENE_AUTOSAVE_MS = 2000;

/**
 * Debounced scene PATCH for user edits on one file.
 *
 * Excalidraw fires `onChange` often; we version the element list and only
 * write when it actually changed. A draw that already PATCHed `spec`+`scene`
 * calls `commitAppliedScene` so this hook does not immediately rewrite the
 * same snapshot. Hidden-tab flush covers the case where the timer never
 * fired before the user left.
 */
export function useSceneAutosave(projectId: string, fileId: string) {
  const lastSavedSceneVersionRef = useRef("");
  const pendingSceneRef = useRef<unknown>(null);
  const sceneSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneSaveInFlightRef = useRef(false);

  const fileIdRef = useRef(fileId);
  useEffect(() => {
    fileIdRef.current = fileId;
    lastSavedSceneVersionRef.current = "";
    pendingSceneRef.current = null;
    sceneSaveInFlightRef.current = false;
    if (sceneSaveTimerRef.current) {
      clearTimeout(sceneSaveTimerRef.current);
      sceneSaveTimerRef.current = null;
    }
  }, [fileId]);

  const flushSceneSave = useCallback(() => {
    const scene = pendingSceneRef.current;
    if (!scene || sceneSaveInFlightRef.current) return;
    sceneSaveInFlightRef.current = true;
    pendingSceneRef.current = null;
    const activeFileId = fileId;

    void queueProjectFilePatch(projectId, activeFileId, { scene: scene as never }, "meta")
      .catch(() => {
        if (fileIdRef.current === activeFileId) {
          pendingSceneRef.current ??= scene;
        }
      })
      .finally(() => {
        if (fileIdRef.current === activeFileId) {
          sceneSaveInFlightRef.current = false;
          if (pendingSceneRef.current) {
            if (sceneSaveTimerRef.current) clearTimeout(sceneSaveTimerRef.current);
            sceneSaveTimerRef.current = setTimeout(flushSceneSave, SCENE_AUTOSAVE_MS);
          }
        }
      });
  }, [fileId, projectId]);

  // Last chance to persist unsaved edits when the tab is backgrounded.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (sceneSaveTimerRef.current) {
        clearTimeout(sceneSaveTimerRef.current);
        sceneSaveTimerRef.current = null;
      }
      flushSceneSave();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flushSceneSave]);

  // First paint: treat the loaded scene as already saved so onChange is a no-op.
  const markSeeded = useCallback((elements: unknown[]) => {
    lastSavedSceneVersionRef.current = sceneElementsVersion(elements);
  }, []);

  // A tool apply already PATCHed this snapshot; cancel any user-edit debounce.
  const commitAppliedScene = useCallback((scene: AppliedScene) => {
    const elements = Array.isArray(scene.elements) ? scene.elements : [];
    lastSavedSceneVersionRef.current = sceneElementsVersion(elements);
    pendingSceneRef.current = null;
    if (sceneSaveTimerRef.current) {
      clearTimeout(sceneSaveTimerRef.current);
      sceneSaveTimerRef.current = null;
    }
  }, []);

  const handleSceneChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      const version = sceneElementsVersion(elements);
      if (version === lastSavedSceneVersionRef.current) return;
      lastSavedSceneVersionRef.current = version;
      pendingSceneRef.current = {
        elements,
        appState: sanitizeSceneAppState(appState),
        files,
      };
      if (sceneSaveTimerRef.current) return;
      sceneSaveTimerRef.current = setTimeout(() => {
        sceneSaveTimerRef.current = null;
        flushSceneSave();
      }, SCENE_AUTOSAVE_MS);
    },
    [flushSceneSave],
  );

  return { handleSceneChange, markSeeded, commitAppliedScene };
}
