import { useCallback, useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { applyDiagramToCanvas, restoreSceneElements } from "@/lib/excalidraw-utils";
import { resolveDiagramScene, sanitizeSceneAppState, sceneHasSavedViewport } from "./helpers";

export function useExcalidrawScene(initialScene: unknown) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const handleAPI = useCallback((nextAPI: ExcalidrawImperativeAPI) => {
    setApi((currentAPI) => (currentAPI === nextAPI ? currentAPI : nextAPI));
  }, []);

  // Excalidraw re-measures its canvas only on window resize, not container
  // resize. Pane changes (sidebar open/close, divider drag) move the container
  // but don't fire a resize, leaving blank space. Dispatching a synthetic
  // resize event forces Excalidraw to re-measure. Chose this over
  // `api.refresh()` because refresh() recomputes scroll offsets but leaves
  // canvas dimensions untouched — measured both: refresh() left a 1524px
  // canvas stuck in a 1908px container, resize event fixed it.
  useEffect(() => {
    if (!api) return;
    const container = document.querySelector(".excalidraw");
    if (!(container instanceof HTMLElement)) return;

    // Compare container width vs canvas width. ResizeObserver alone fires
    // before Excalidraw finishes its initial sizing, so the correction gets
    // overwritten. Checking both catches whichever side moves last.
    const observer = new ResizeObserver(() => {
      const width = container.getBoundingClientRect().width;
      const canvas = container.querySelector("canvas");
      if (!canvas || Math.abs(canvas.getBoundingClientRect().width - width) < 1) return;
      // Terminates: the event makes Excalidraw re-measure to `width`, after
      // which the two agree and this returns above.
      window.dispatchEvent(new Event("resize"));
    });

    observer.observe(container);
    // The canvases too, so Excalidraw sizing itself late re-runs the check.
    for (const canvas of container.querySelectorAll("canvas")) observer.observe(canvas);

    return () => observer.disconnect();
  }, [api]);

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
    const hasViewport = sceneHasSavedViewport(scene.appState);
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

      // Skip scrollToContent if the scene already has a saved camera —
      // Excalidraw already positioned it from initialData, so fitting again
      // would jerk the viewport right after the user sees it.
      if (hasViewport) return;

      // Wait a frame for the editor and adjacent panes to finish laying out
      // before fitting — viewport dimensions aren't stable until then.
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
