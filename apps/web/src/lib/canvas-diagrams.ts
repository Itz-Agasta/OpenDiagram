import type { DiagramSpec } from "@OpenDiagram/harness";

/**
 * Every diagram drawn on one canvas, keyed by the frame it occupies.
 *
 * A canvas holds several diagrams; the model was only ever told about one. The
 * thread carried a single `spec` and a single `frame_id`, so drawing a second
 * subject overwrote the first -- after "netflix" then "youtube", the Netflix spec
 * was gone and "add redis to netflix" had nothing to modify. The shapes were
 * still on screen, but shapes are rendered output: nothing turns rectangles back
 * into `{nodes, edges}`.
 *
 * So the list lives here instead, and it lives on the FILE rather than on the
 * thread. The diagrams belong to the canvas: start a new conversation and they
 * are all still visible, so a new thread has to be able to see them too.
 *
 * The frame id doubles as the diagram's identity. It is already unique, already
 * ours, and already what the canvas needs to replace the right drawing -- and
 * because we assign it rather than the model, a rename cannot break it.
 */
export type CanvasDiagram = {
  /** The Excalidraw frame this diagram occupies. Also what the model targets. */
  id: string;
  title: string;
  spec: DiagramSpec;
};

/** What `project_file_content.spec` holds for a diagram file. */
type StoredCanvasDiagrams = { diagrams: CanvasDiagram[] };

/**
 * How many diagrams reach the prompt.
 *
 * Each spec is a few kB, so the whole list is cheap at realistic canvas sizes and
 * the model gets to see every diagram it might be asked about. The cap exists so
 * a pathological canvas cannot quietly double the prompt; the oldest drop out
 * first, since the recent ones are what a conversation is about.
 *
 * A PROMPT bound only. Applied in `upsertCanvasDiagram` too it hit the array
 * `serializeCanvasDiagrams` persists, so the ninth diagram deleted the first
 * one's spec while its frame stayed on screen -- a drawing nothing could edit.
 */
export const MAX_PROMPT_DIAGRAMS = 8;

function isDiagramSpec(value: unknown): value is DiagramSpec {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as DiagramSpec).nodes) &&
    Array.isArray((value as DiagramSpec).edges)
  );
}

/**
 * Read the stored list. Returns empty for anything that is not it, including the
 * single bare spec files were written with before this existed -- the caller
 * recovers those, because pairing one to its frame needs the canvas.
 */
export function parseCanvasDiagrams(stored: unknown): CanvasDiagram[] {
  if (!stored || typeof stored !== "object") return [];

  const list = (stored as StoredCanvasDiagrams).diagrams;
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) =>
    entry && typeof entry.id === "string" && isDiagramSpec(entry.spec)
      ? [{ id: entry.id, title: entry.spec.title ?? entry.title ?? "Untitled", spec: entry.spec }]
      : [],
  );
}

/**
 * Add a diagram, or replace the one already in that frame. Newest last.
 *
 * Deliberately unbounded: this is the persisted list. See `MAX_PROMPT_DIAGRAMS`.
 */
export function upsertCanvasDiagram(
  current: CanvasDiagram[],
  next: CanvasDiagram,
): CanvasDiagram[] {
  const without = current.filter((diagram) => diagram.id !== next.id);
  return [...without, next];
}

/** The shape written back to `project_file_content.spec`. */
export function serializeCanvasDiagrams(diagrams: CanvasDiagram[]): StoredCanvasDiagrams {
  return { diagrams };
}

/**
 * What the model is shown. Only the id and the spec -- the title is already in
 * the spec, and repeating it would just be tokens.
 */
export function toPromptDiagrams(diagrams: CanvasDiagram[]) {
  return diagrams
    .filter((diagram) => diagram.id.length > 0)
    .slice(-MAX_PROMPT_DIAGRAMS)
    .map((diagram) => ({ id: diagram.id, spec: diagram.spec }));
}
