import { useEffect, useRef, useState, type RefObject } from "react";
import type { ChatMessage } from "#/lib/types";
import { queueProjectFilePatch } from "#/lib/api";
import { log } from "#/lib/utils/logger";
import {
  serializeCanvasDiagrams,
  upsertCanvasDiagram,
  type CanvasDiagram,
} from "#/lib/utils/canvas-diagrams";
import {
  isDrawDiagramPart,
  normalizeToolPart,
  type DrawDiagramInput,
  type DrawDiagramOutput,
} from "#/lib/utils/diagram-chat";
import { applyDiagramToCanvas, sanitizeSceneAppState } from "#/lib/utils/excalidraw-utils";
/** Scene snapshot after a draw. Forwarded to autosave; not a typed Excalidraw schema. */
export type AppliedScene = {
  elements: unknown;
  appState: unknown;
  files: unknown;
};

type UseApplyDrawDiagramOptions = {
  messages: ChatMessage[];
  // Excalidraw's imperative API is typed in the whiteboard, not here.
  excalidrawAPI: any | null;
  isHistorySeeded: boolean;
  skippedMessageIdsRef: RefObject<Set<string>>;
  diagramsRef: RefObject<CanvasDiagram[]>;
  projectId: string;
  fileId: string;
  onApplied: (scene: AppliedScene) => void;
};

/**
 * Paints completed `draw_diagram` tool results onto the canvas.
 *
 * `draw_diagram` runs on the server. The client only consumes parts once
 * `state === "output-available"`. `chat.messages` updates every stream tick,
 * so each `toolCallId` is applied once. Seeded history is skipped — those
 * drawings already live in `file.scene`. Applies are chained so two draws
 * in one turn stay in order. The file PATCH is not on that chain — a slow
 * save must not delay the next paint. Switching files bumps `generation` so an
 * in-flight apply cannot paint or PATCH the next file.
 */
export function useApplyDrawDiagram(options: UseApplyDrawDiagramOptions) {
  const {
    messages,
    excalidrawAPI,
    isHistorySeeded,
    skippedMessageIdsRef,
    diagramsRef,
    projectId,
    fileId,
    onApplied,
  } = options;

  const [applyError, setApplyError] = useState<string | null>(null);
  const appliedToolCallsRef = useRef(new Set<string>());
  const applyChainRef = useRef(Promise.resolve());
  const generationRef = useRef(0);
  const onAppliedRef = useRef(onApplied);
  const lastSeededFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    onAppliedRef.current = onApplied;
  }, [onApplied]);

  // New file: drop the apply watermark and abandon any chain from the last file.
  useEffect(() => {
    generationRef.current += 1;
    appliedToolCallsRef.current.clear();
    applyChainRef.current = Promise.resolve();
    setApplyError(null);
    lastSeededFileIdRef.current = null;
  }, [fileId]);

  useEffect(() => {
    lastSeededFileIdRef.current = isHistorySeeded ? fileId : null;
  }, [isHistorySeeded, fileId]);

  // Side-effect consumer of UIMessage parts. Cannot run during render:
  // Excalidraw mutate + file PATCH are async.
  useEffect(() => {
    if (!excalidrawAPI || !isHistorySeeded || lastSeededFileIdRef.current !== fileId) return;

    const generation = generationRef.current;
    const skipped = skippedMessageIdsRef.current;

    for (const message of messages) {
      if (skipped?.has(message.id) || message.role !== "assistant") continue;

      for (const rawPart of message.parts) {
        log.info({
          event: "useApplyDrawDiagram:processPart",
          messageId: message.id,
          partType: rawPart?.type,
          rawPart,
        });

        if (!isDrawDiagramPart(rawPart)) continue;
        const part = normalizeToolPart(rawPart) || rawPart;

        log.info({
          event: "useApplyDrawDiagram:drawDiagramPartMatched",
          toolCallId: part.toolCallId,
          state: part.state,
          input: part.input,
          output: part.output,
        });

        if (part.state !== "output-available") continue;
        if (appliedToolCallsRef.current.has(part.toolCallId)) continue;

        const output = part.output as DrawDiagramOutput | undefined;
        const skeletons = output?.skeletons;
        if (!skeletons) {
          log.warn({
            event: "useApplyDrawDiagram:noSkeletons",
            toolCallId: part.toolCallId,
            output,
          });
          continue;
        }
        appliedToolCallsRef.current.add(part.toolCallId);
        const { targetId, ...spec } = (part.input ?? {}) as DrawDiagramInput;
        const replaceFrameId =
          targetId && (diagramsRef.current ?? []).some((diagram) => diagram.id === targetId)
            ? targetId
            : null;

        applyChainRef.current = applyChainRef.current.then(async () => {
          if (generation !== generationRef.current) return;

          try {
            const { frameId } = await applyDiagramToCanvas(
              excalidrawAPI,
              skeletons,
              output.rawElements || [],
              { replaceFrameId },
            );

            // Camera is fitted inside applyDiagramToCanvas (after paint). Snapshot now.
            log.info({
              event: "useApplyDrawDiagram:afterApply",
              frameId,
              zoom: excalidrawAPI?.getAppState?.()?.zoom?.value,
              scrollX: excalidrawAPI?.getAppState?.()?.scrollX,
              scrollY: excalidrawAPI?.getAppState?.()?.scrollY,
              elementsCount: excalidrawAPI?.getSceneElements?.()?.length,
              frameElement: excalidrawAPI
                ?.getSceneElements?.()
                ?.find((el: any) => el.type === "frame"),
            });

            if (generation !== generationRef.current || !frameId) return;
            const current = diagramsRef.current ?? [];
            const base = replaceFrameId
              ? current.filter((diagram) => diagram.id !== replaceFrameId)
              : current;
            const updated = upsertCanvasDiagram(base, {
              id: frameId,
              title: spec.title || "Untitled",
              spec,
            });

            diagramsRef.current = updated;
            setApplyError(null);

            const scene = {
              elements: excalidrawAPI.getSceneElements(),
              appState: sanitizeSceneAppState(excalidrawAPI.getAppState()),
              files: excalidrawAPI.getFiles?.() ?? {},
            };

            try {
              await queueProjectFilePatch(
                projectId,
                fileId,
                {
                  spec: serializeCanvasDiagrams(updated) as never,
                  scene: scene as never,
                },
                "meta",
              );
            } catch (err) {
              if (generation !== generationRef.current) return;
              appliedToolCallsRef.current.delete(part.toolCallId);
              setApplyError(err instanceof Error ? err.message : "Failed to save diagram");
              return;
            }

            if (generation !== generationRef.current) return;
            onAppliedRef.current(scene);
          } catch (err) {
            if (generation !== generationRef.current) return;
            appliedToolCallsRef.current.delete(part.toolCallId);
            setApplyError(err instanceof Error ? err.message : "Failed to draw on canvas");
          }
        });
      }
    }
  }, [
    diagramsRef,
    excalidrawAPI,
    fileId,
    isHistorySeeded,
    messages,
    projectId,
    skippedMessageIdsRef,
  ]);

  return { applyError, setApplyError };
}
