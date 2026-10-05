"use client";

import "@excalidraw/excalidraw/index.css";
import "./excalidraw-overrides.css";
import type {
  BinaryFiles,
  ExcalidrawProps,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import dynamic from "next/dynamic";
import { Download } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeSceneAppState } from "./workspace-layout/helpers";

// MainMenu is a compound child of Excalidraw and just as browser-only, so both
// come from the one dynamic import.
const Excalidraw = dynamic(
  async () => {
    const { Excalidraw, MainMenu } = await import("@excalidraw/excalidraw");
    return function OpenDiagramExcalidraw({
      onExport,
      ...props
    }: ExcalidrawProps & { onExport?: () => void }) {
      return (
        <Excalidraw {...props}>
          {/* Replaces the default menu: no Open/Save-to-file (we persist),
              no "Excalidraw links", no dark toggle that only darkens the canvas. */}
          <MainMenu>
            {onExport && (
              <MainMenu.Item icon={<Download size={16} />} onSelect={onExport}>
                Export...
              </MainMenu.Item>
            )}
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ClearCanvas />
          </MainMenu>
        </Excalidraw>
      );
    };
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
  onExport?: () => void;
  onSceneChange?: (elements: readonly unknown[], appState: unknown, files: unknown) => void;
  initialScene?: unknown;
}

function toExcalidrawInitialData(scene: unknown): ExcalidrawInitialDataState | undefined {
  if (!scene || typeof scene !== "object") return undefined;

  const value = scene as { elements?: unknown; appState?: unknown; files?: unknown };
  const appState =
    value.appState && typeof value.appState === "object"
      ? (sanitizeSceneAppState(value.appState) as ExcalidrawInitialDataState["appState"])
      : undefined;

  return {
    elements: Array.isArray(value.elements) ? value.elements : undefined,
    appState,
    files:
      value.files && typeof value.files === "object" ? (value.files as BinaryFiles) : undefined,
  };
}

export function Whiteboard({ onAPIReady, onExport, onSceneChange, initialScene }: WhiteboardProps) {
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
    <div ref={containerRef} className="od-canvas w-full h-full overflow-hidden relative">
      <Excalidraw
        excalidrawAPI={handleAPI}
        onExport={onExport}
        initialData={toExcalidrawInitialData(initialScene)}
        onChange={(elements, appState, files) => onSceneChange?.(elements, appState, files)}
        // Excalidraw's own Text-to-diagram and Wireframe-to-code compete with the agent.
        aiEnabled={false}
        UIOptions={{
          canvasActions: {
            saveToActiveFile: false,
            loadScene: false,
            toggleTheme: null,
            // Ctrl+Shift+E would open Excalidraw's own dialog around our panel and its sign-in gate.
            export: false,
            saveAsImage: false,
          },
        }}
      />
    </div>
  );
}

// TODO: Need to redesign it
