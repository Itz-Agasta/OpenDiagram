"use client";

import "@excalidraw/excalidraw/index.css";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import dynamic from "next/dynamic";
import { useCallback } from "react";

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
  const handleAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      onAPIReady?.(api);
    },
    [onAPIReady],
  );

  return (
    <div className="w-full h-full overflow-hidden relative">
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

// Need to redesign it
