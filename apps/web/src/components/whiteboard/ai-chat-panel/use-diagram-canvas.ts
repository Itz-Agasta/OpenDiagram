import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import type { RefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSpec } from "@OpenDiagram/harness";
import { applyDiagramToCanvas } from "@/lib/excalidraw-utils";
import { updateProjectFile } from "@/lib/projects-client";
import type { DrawDiagramOutput } from "./types";

interface UseDiagramCanvasOptions {
  diagramMessages: UIMessage[];
  currentSpecRef: RefObject<DiagramSpec | undefined>;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  fileId?: string;
  initialSpec?: DiagramSpec;
  projectId?: string;
}

export function useDiagramCanvas({
  currentSpecRef,
  diagramMessages,
  excalidrawAPI,
  fileId,
  initialSpec,
  projectId,
}: UseDiagramCanvasOptions) {
  const frameByTitleRef = useRef(new Map<string, string>());
  const appliedToolCallsRef = useRef(new Set<string>());
  const applyChainRef = useRef<Promise<void>>(Promise.resolve());
  const skippedMessageIdsRef = useRef(new Set<string>());
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    skippedMessageIdsRef.current = new Set(diagramMessages.map((message) => message.id));
    currentSpecRef.current = initialSpec;
    frameByTitleRef.current.clear();
    appliedToolCallsRef.current.clear();
    setApplyError(null);
  }, [fileId, initialSpec]);

  useEffect(() => {
    if (!excalidrawAPI) return;
    for (const message of diagramMessages) {
      if (skippedMessageIdsRef.current.has(message.id)) continue;
      if (message.role !== "assistant") continue;

      for (const part of message.parts) {
        if (part.type !== "tool-draw_diagram" || part.state !== "output-available") continue;
        if (appliedToolCallsRef.current.has(part.toolCallId)) continue;

        appliedToolCallsRef.current.add(part.toolCallId);
        const spec = part.input as DiagramSpec;
        const output = part.output as DrawDiagramOutput;
        currentSpecRef.current = spec;

        applyChainRef.current = applyChainRef.current.then(() =>
          applyDiagramToCanvas(excalidrawAPI, output.skeletons, output.rawElements, {
            replaceFrameId: frameByTitleRef.current.get(spec.title) ?? null,
          })
            .then(({ frameId }) => {
              if (frameId) frameByTitleRef.current.set(spec.title, frameId);
              if (!projectId || !fileId) return;

              window.setTimeout(() => {
                void updateProjectFile(projectId, fileId, { spec });
              }, 0);
            })
            .catch((error: unknown) => {
              appliedToolCallsRef.current.delete(part.toolCallId);
              setApplyError(error instanceof Error ? error.message : "Failed to draw on canvas");
            }),
        );
      }
    }
  }, [diagramMessages, excalidrawAPI, fileId, projectId]);

  return { applyError, setApplyError };
}
