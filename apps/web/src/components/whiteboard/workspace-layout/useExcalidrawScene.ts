import { useCallback, useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { applyDiagramToCanvas, restoreSceneElements } from "@/lib/excalidraw-utils";
import { resolveDiagramScene, sanitizeSceneAppState } from "./helpers";

export function useExcalidrawScene(initialScene: unknown) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const handleAPI = useCallback((nextAPI: ExcalidrawImperativeAPI) => {
    setApi((currentAPI) => (currentAPI === nextAPI ? currentAPI : nextAPI));
  }, []);

  useEffect(() => {
    if (!api) return;
    const scene = resolveDiagramScene(initialScene);
    if (scene.kind === "legacy") {
      void applyDiagramToCanvas(api, scene.skeletons as never[], scene.rawElements);
      return;
    }
    if (scene.kind === "empty") {
      api.updateScene({ elements: [] });
      return;
    }
    let cancelled = false;
    let frame: number | undefined;
    const appState = sanitizeSceneAppState(scene.appState);
    const baseline = sceneFingerprint(api.getSceneElements());
    if (scene.files && typeof scene.files === "object") api.addFiles(Object.values(scene.files));
    void restoreSceneElements(scene.elements).then((elements) => {
      if (cancelled) return;
      if (sceneFingerprint(api.getSceneElements()) !== baseline) return;
      api.updateScene({
        elements,
        appState: appState && typeof appState === "object" ? appState : undefined,
      });
      if (elements.length === 0) return;

      // Viewport dimensions settle after the editor and adjacent panes render.
      frame = window.requestAnimationFrame(() => {
        api.scrollToContent(elements, {
          fitToViewport: true,
          viewportZoomFactor: 0.85,
          animate: false,
        });
      });
    });

    return () => {
      cancelled = true;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [api, initialScene]);

  return { excalidrawAPI: api, handleExcalidrawAPI: handleAPI };
}

function sceneFingerprint(elements: readonly { id?: string; version?: number }[]) {
  return JSON.stringify(elements.map((element) => [element.id ?? "", element.version ?? 0]));
}
