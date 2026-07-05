"use client";

import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { SavedProjectFile } from "@/lib/projects-client";
import { Whiteboard } from "../Whiteboard";

const MilkdownDocEditor = dynamic(
  () => import("../MilkdownDocEditor").then((mod) => mod.MilkdownDocEditor),
  {
    loading: () => (
      <div className="grid h-full place-items-center bg-white text-[14px] text-od-ink-muted">
        Loading markdown editor...
      </div>
    ),
    ssr: false,
  },
);

type WorkspaceEditorPaneProps = {
  activeFile: SavedProjectFile | null;
  docContent: string;
  initialScene: unknown;
  onDocChange: (value: string) => void;
  onExcalidrawAPI: (api: ExcalidrawImperativeAPI) => void;
  onSceneChange: (elements: readonly unknown[], appState: unknown, files: unknown) => void;
};

export function WorkspaceEditorPane({
  activeFile,
  docContent,
  initialScene,
  onDocChange,
  onExcalidrawAPI,
  onSceneChange,
}: WorkspaceEditorPaneProps) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {activeFile?.type === "doc" ? (
        <div className="flex h-full flex-col bg-white">
          <MilkdownDocEditor key={activeFile.id} value={docContent} onChange={onDocChange} />
        </div>
      ) : (
        <Whiteboard
          initialScene={initialScene}
          onAPIReady={onExcalidrawAPI}
          onSceneChange={onSceneChange}
        />
      )}
    </div>
  );
}
