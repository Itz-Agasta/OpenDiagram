"use client";

import { useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { AIChatPanel } from "./AIChatPanel";
import { Whiteboard } from "./Whiteboard";

export function WorkspaceLayout() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 min-w-0">
        <Whiteboard onAPIReady={setExcalidrawAPI} />
      </div>
      <div className="w-96 shrink-0">
        <AIChatPanel excalidrawAPI={excalidrawAPI} />
      </div>
    </div>
  );
}
