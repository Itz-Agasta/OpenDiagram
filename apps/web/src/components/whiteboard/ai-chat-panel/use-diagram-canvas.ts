import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSpec } from "@OpenDiagram/harness";
import {
  applyDiagramToCanvas,
  lockFrame,
  releaseFrame,
  removeFramesFromCanvas,
} from "@/lib/excalidraw-utils";
import { upsertCanvasDiagram, type CanvasDiagram } from "@/lib/canvas-diagrams";
import { toast } from "sonner";
import type { DrawDiagramOutput, DrawSystemOutput, FixProgress } from "./types";

interface UseDiagramCanvasOptions {
  /** Every diagram currently on this canvas. */
  diagrams: CanvasDiagram[];
  /** Reports the list after a draw, so it can be sent with the next turn and stored. */
  onDiagramsChange: (diagrams: CanvasDiagram[]) => void;
  diagramMessages: UIMessage[];
  /** False once the turn ends, stopped or failed: any frame still polishing unlocks then. */
  streaming: boolean;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  fileId?: string;
  projectId?: string;
}

/** A final view worth swapping in: the canvas already shows an unchanged one. */
function changed<T extends DrawDiagramOutput>(view: T): T | undefined {
  return view.fix?.status === "done" && view.fix.changed ? view : undefined;
}

export function useDiagramCanvas({
  diagrams,
  onDiagramsChange,
  diagramMessages,
  streaming,
  excalidrawAPI,
  fileId,
  projectId,
}: UseDiagramCanvasOptions) {
  const appliedToolCallsRef = useRef(new Set<string>());
  const applyChainRef = useRef<Promise<void>>(Promise.resolve());
  const skippedMessageIdsRef = useRef(new Set<string>());
  // `<toolCallId>-<view>` -> the locked frame a first draw made, while its fixer runs.
  const polishingRef = useRef(new Map<string, string>());
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
      scroll = true,
    ): Promise<string | undefined> => {
      const replaceFrameId = knownFrame(targetId);
      const { frameId } = await applyDiagramToCanvas(
        excalidrawAPI,
        output.skeletons,
        output.rawElements,
        { replaceFrameId, scroll },
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

    /** A first draw while the fixer works: drawn now, locked until its pass ends. */
    const drawFirst = async (
      key: string,
      view: DrawDiagramOutput,
      spec: DiagramSpec,
      target?: string,
    ) => {
      const frameId = await drawFrame(view, spec, target);
      if (!frameId) return;
      polishingRef.current.set(key, frameId);
      await lockFrame(excalidrawAPI, frameId, spec.title);
    };

    /**
     * A view's pass ended: the polished drawing replaces the first draw in
     * place, or the frame just unlocks when nothing changed. No camera move:
     * views swap mid-turn, and the user may be looking at another one.
     */
    const swap = async (key: string, polished?: DrawDiagramOutput, spec?: DiagramSpec) => {
      const frameId = polishingRef.current.get(key);
      polishingRef.current.delete(key);
      if (!frameId || !knownFrame(frameId)) return;
      await releaseFrame(excalidrawAPI, frameId, { replacing: Boolean(polished && spec) });
      if (polished && spec) await drawFrame(polished, spec, frameId, false);
    };

    for (const message of diagramMessages) {
      if (skippedMessageIdsRef.current.has(message.id)) continue;
      if (message.role !== "assistant") continue;

      for (const part of message.parts) {
        if (part.type === "data-fix" && part.id) {
          const fix = part.data as FixProgress;
          // Only once its first draw is queued: the stream may deliver the
          // part before the tool's first yield, and the final yield covers that.
          const toolCallId = part.id.slice(0, part.id.lastIndexOf("-"));
          const key = `${part.id}:fixed`;
          if (fix.status !== "done" || appliedToolCallsRef.current.has(key)) continue;
          if (!appliedToolCallsRef.current.has(`${toolCallId}:first`)) continue;
          appliedToolCallsRef.current.add(key);
          queue(() => swap(part.id!, fix.view, fix.view?.spec));
          // A pass that ran but changed nothing otherwise reads as a swap that broke.
          // The row's verdict says why: nothing better, or the pass stopped early.
          if (!fix.view && fix.lines.length > 0)
            toast.info(`Kept the original layout of “${fix.title}”.`);
          continue;
        }
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
          else if (phase === "final") queue(() => swap(`${id}-0`, changed(output), spec));
          else
            queue(async () => {
              await drawFrame(output, spec, targetId);
            }, retry);
          continue;
        }

        const systemViews = views as DrawSystemOutput["views"];
        if (phase === "final") {
          systemViews.forEach((view, i) =>
            queue(() => swap(`${id}-${i}`, changed(view), view.spec)),
          );
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

  useEffect(() => {
    if (streaming || !excalidrawAPI) return;
    applyChainRef.current = applyChainRef.current.then(async () => {
      for (const frameId of polishingRef.current.values())
        await releaseFrame(excalidrawAPI, frameId);
      polishingRef.current.clear();
    });
  }, [streaming, excalidrawAPI]);

  return { applyError, setApplyError };
}
