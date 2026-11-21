import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSpec } from "@OpenDiagram/harness";
import { applyDiagramToCanvas, removeFramesFromCanvas } from "@/lib/excalidraw-utils";
import { upsertCanvasDiagram, type CanvasDiagram } from "@/lib/canvas-diagrams";
import { toast } from "sonner";
import type { DrawDiagramOutput, DrawSystemOutput } from "./types";

/**
 * What the user could have changed in a frame: every shape's place and size,
 * every text's content, and the element count. Text geometry is left out on
 * purpose: Excalidraw re-measures text on its own, which is not an edit.
 */
function framePrint(api: ExcalidrawImperativeAPI, frameId: string): string {
  return api
    .getSceneElements()
    .filter((el) => el.id === frameId || el.frameId === frameId)
    .map((el) =>
      el.type === "text"
        ? `${el.id}:${el.text}`
        : `${el.id}:${Math.round(el.x)},${Math.round(el.y)},${Math.round(el.width)},${Math.round(el.height)}`,
    )
    .sort()
    .join("|");
}

interface UseDiagramCanvasOptions {
  /** Every diagram currently on this canvas. */
  diagrams: CanvasDiagram[];
  /** Reports the list after a draw, so it can be sent with the next turn and stored. */
  onDiagramsChange: (diagrams: CanvasDiagram[]) => void;
  diagramMessages: UIMessage[];
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  fileId?: string;
  projectId?: string;
}

export function useDiagramCanvas({
  diagrams,
  onDiagramsChange,
  diagramMessages,
  excalidrawAPI,
  fileId,
  projectId,
}: UseDiagramCanvasOptions) {
  const appliedToolCallsRef = useRef(new Set<string>());
  const applyChainRef = useRef<Promise<void>>(Promise.resolve());
  const skippedMessageIdsRef = useRef(new Set<string>());
  // `<toolCallId>-<view>` -> the frame a first draw made, while its fixer runs.
  const polishingRef = useRef(new Map<string, { frameId: string; print: string }>());
  const [applyError, setApplyError] = useState<string | null>(null);

  // Mirrored because the apply chain reads it from inside a promise that resolves
  // after this render, and a draw within the same turn must see the frame the
  // previous draw just created.
  const diagramsRef = useRef(diagrams);
  useEffect(() => {
    diagramsRef.current = diagrams;
  }, [diagrams]);

  useEffect(() => {
    skippedMessageIdsRef.current = new Set(diagramMessages.map((message) => message.id));
    appliedToolCallsRef.current.clear();
    setApplyError(null);
  }, [fileId]);

  useEffect(() => {
    if (!excalidrawAPI) return;

    // Matched against the known list rather than trusted outright: an id the
    // model invented or garbled names no frame we have, and replacing a frame
    // id we do not recognise would let a hallucination overwrite a diagram the
    // user can see. Unrecognised means "draw a new one", which is recoverable.
    // Read inside the chain, so it sees the frames earlier draws of this turn made.
    const knownFrame = (id: string | undefined) =>
      id && diagramsRef.current.some((diagram) => diagram.id === id) ? id : null;

    const report = (next: CanvasDiagram[]) => {
      diagramsRef.current = next;
      onDiagramsChange(next);
    };

    const queue = (step: () => Promise<void>, onError?: () => void) => {
      applyChainRef.current = applyChainRef.current.then(step).catch((error: unknown) => {
        onError?.();
        setApplyError(error instanceof Error ? error.message : "Failed to draw on canvas");
      });
    };

    const drawFrame = async (
      output: DrawDiagramOutput,
      spec: DiagramSpec,
      targetId: string | undefined,
    ): Promise<string | undefined> => {
      const replaceFrameId = knownFrame(targetId);
      const { frameId } = await applyDiagramToCanvas(
        excalidrawAPI,
        output.skeletons,
        output.rawElements,
        { replaceFrameId },
      );
      if (!frameId) return undefined;
      // Replacing does not reuse the frame id. `applyDiagramToCanvas`
      // deletes the old frame along with every element inside it and
      // builds a fresh one (`deleteFrames` in `excalidraw-utils.ts`), so the id it
      // returns is new even when `replaceFrameId` matched. Dropping the
      // replaced entry is therefore part of the update, not a tidy-up:
      // without it the list keeps an id whose frame no longer exists, and
      // that phantom gets sent to the model on the next turn as a diagram
      // it could be asked to edit.
      const base = replaceFrameId
        ? diagramsRef.current.filter((diagram) => diagram.id !== replaceFrameId)
        : diagramsRef.current;
      // Recorded immediately so a second draw in the same turn targets the
      // frame the first one just made, and reported upward so the list is
      // sent with the next request and written to the file.
      report(upsertCanvasDiagram(base, { id: frameId, title: spec.title, spec }));
      return frameId;
    };

    /** A first draw while the fixer works: drawn now, its frame kept for the swap. */
    const drawFirst = async (
      key: string,
      view: DrawDiagramOutput,
      spec: DiagramSpec,
      target?: string,
    ) => {
      const frameId = await drawFrame(view, spec, target);
      if (frameId)
        polishingRef.current.set(key, { frameId, print: framePrint(excalidrawAPI, frameId) });
    };

    /**
     * The fixer's final drawing replaces its first draw in place, unless the
     * user edited that frame meanwhile: their edits win over the polish.
     */
    const swap = async (key: string, view: DrawDiagramOutput, spec: DiagramSpec) => {
      const first = polishingRef.current.get(key);
      polishingRef.current.delete(key);
      if (!first || !view.fix || view.fix.status !== "done" || !view.fix.changed) return;
      if (!knownFrame(first.frameId)) return;
      if (framePrint(excalidrawAPI, first.frameId) !== first.print) {
        toast.info(`Kept your edits to “${spec.title}”. The polished layout was not applied.`);
        return;
      }
      await drawFrame(view, spec, first.frameId);
    };

    for (const message of diagramMessages) {
      if (skippedMessageIdsRef.current.has(message.id)) continue;
      if (message.role !== "assistant") continue;

      for (const part of message.parts) {
        if (part.type !== "tool-draw_diagram" && part.type !== "tool-draw_system") continue;
        if (part.state !== "output-available") continue;
        const id = part.toolCallId;
        const views =
          part.type === "tool-draw_diagram"
            ? [part.output as DrawDiagramOutput]
            : (part.output as DrawSystemOutput).views;
        // Without a fixer there is one output; with one, a preliminary first
        // draw and then the final. A throttled render can skip the preliminary,
        // and then the final draws like an ordinary one.
        const phase =
          views[0]?.fix?.status === "polishing"
            ? "first"
            : views[0]?.fix && appliedToolCallsRef.current.has(`${id}:first`)
              ? "final"
              : "only";
        const key = phase === "only" ? id : `${id}:${phase}`;
        if (appliedToolCallsRef.current.has(key)) continue;
        appliedToolCallsRef.current.add(key);
        const retry = () => appliedToolCallsRef.current.delete(key);

        if (part.type === "tool-draw_diagram") {
          // Which diagram this replaces is now the model's answer, not a guess.
          //
          // It used to be inferred from how many node ids the new spec shared with
          // the last one drawn. That could only ever see ONE previous diagram, so on
          // a canvas holding several it compared against the wrong one, and a
          // revision that renamed or restructured heavily shared too few ids and
          // read as a new subject, duplicating the frame.
          //
          // FIXME(gemini-field-fidelity): the same model mistypes `from`/`to` as
          // `from1`/`to1` on edges, so a garbled `targetId` will silently land here
          // as a duplicate frame. Deliberately no node-id inference fallback: the
          // reliability of extra fields is tracked separately. `targetedIds` in the
          // diagram route's log is the signal to watch.
          const { targetId, ...spec } = part.input as DiagramSpec & { targetId?: string };
          const output = views[0]!;
          if (phase === "first") queue(() => drawFirst(`${id}-0`, output, spec, targetId), retry);
          else if (phase === "final") queue(() => swap(`${id}-0`, output, spec));
          else
            queue(async () => {
              await drawFrame(output, spec, targetId);
            }, retry);
          continue;
        }

        const systemViews = views as DrawSystemOutput["views"];
        if (phase === "final") {
          systemViews.forEach((view, i) => queue(() => swap(`${id}-${i}`, view, view.spec)));
          continue;
        }
        // A redo deletes the old set, then draws the new one like a fresh set.
        // Slotting view i where replaceIds[i] stood was tried: a replacement keeps
        // the old frame's top-left, so a view that grew covered its neighbour. Each view
        // is queued on its own, and a failed one is not retried: re-running the
        // call would duplicate every view that did land.
        const replaceIds = (part.input as { replaceIds?: string[] }).replaceIds ?? [];
        queue(async () => {
          const old = replaceIds.filter((frame) => knownFrame(frame));
          if (old.length === 0) return;
          await removeFramesFromCanvas(excalidrawAPI, old);
          report(diagramsRef.current.filter((diagram) => !old.includes(diagram.id)));
        });
        systemViews.forEach((view, i) =>
          queue(async () => {
            if (phase === "first") await drawFirst(`${id}-${i}`, view, view.spec);
            else await drawFrame(view, view.spec, undefined);
          }),
        );
      }
    }
  }, [diagramMessages, excalidrawAPI, fileId, onDiagramsChange, projectId]);

  return { applyError, setApplyError };
}
