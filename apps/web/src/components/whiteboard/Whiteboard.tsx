"use client";

import "@excalidraw/excalidraw/index.css";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

const Excalidraw = dynamic(
  async () => {
    const { Excalidraw } = await import("@excalidraw/excalidraw");
    return Excalidraw;
  },
  { ssr: false, loading: () => <WhiteboardSkeleton /> },
);

function WhiteboardSkeleton() {
  return (
    <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">
      <span className="text-muted-foreground text-sm">Loading canvas…</span>
    </div>
  );
}

interface WhiteboardProps {
  onAPIReady?: (api: ExcalidrawImperativeAPI) => void;
  onSceneChange?: (elements: readonly unknown[], appState: unknown, files: unknown) => void;
  initialScene?: unknown;
}

function toExcalidrawInitialData(scene: unknown): ExcalidrawInitialDataState | undefined {
  if (!scene || typeof scene !== "object") return undefined;

  const value = scene as { elements?: unknown; appState?: unknown; files?: unknown };
  const appState =
    value.appState && typeof value.appState === "object"
      ? ({
          ...(value.appState as Record<string, unknown>),
          collaborators: undefined,
        } as ExcalidrawInitialDataState["appState"])
      : undefined;

  return {
    elements: Array.isArray(value.elements) ? value.elements : undefined,
    appState,
    files:
      value.files && typeof value.files === "object" ? (value.files as BinaryFiles) : undefined,
  };
}

export function Whiteboard({ onAPIReady, onSceneChange, initialScene }: WhiteboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const handleAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      setIsMounted(true);
      onAPIReady?.(api);
    },
    [onAPIReady],
  );

  // Pane resizes reach Excalidraw only as a window resize. Not `api.refresh()`:
  // it recomputes scroll offsets but not canvas size, leaving a 1524px canvas
  // in a 1908px container. Gated on the API callback because the canvases exist
  // only once the dynamically imported editor has mounted.
  useEffect(() => {
    const container = containerRef.current;
    if (!isMounted || !container) return;

    // Watch the canvases as well as the container: either side can settle last.
    const observer = new ResizeObserver(() => {
      const canvases = container.querySelectorAll("canvas");
      // Re-observing a known target is a no-op, so this also picks up the
      // new-element canvas Excalidraw mounts mid-stroke.
      for (const element of canvases) observer.observe(element);

      const canvas = canvases[0];
      if (!canvas) return;
      const width = container.getBoundingClientRect().width;
      if (Math.abs(canvas.getBoundingClientRect().width - width) < 1) return;
      // Terminates: Excalidraw re-measures to `width`, then the two agree.
      window.dispatchEvent(new Event("resize"));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isMounted]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative">
      <Excalidraw
        excalidrawAPI={handleAPI}
        initialData={toExcalidrawInitialData(initialScene)}
        onChange={(elements, appState, files) => onSceneChange?.(elements, appState, files)}
        UIOptions={{
          canvasActions: {
            saveToActiveFile: false,
            loadScene: false,
          },
        }}
      />
    </div>
  );
}

// TODO: Need to redesign it
