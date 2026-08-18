import type { DiagramSpec } from "@OpenDiagram/harness";

export type CanvasDiagram = {
  id: string;
  title: string;
  spec: DiagramSpec;
};

export const MAX_PROMPT_DIAGRAMS = 8;

function isDiagramSpec(value: unknown): value is DiagramSpec {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as DiagramSpec).nodes) &&
    Array.isArray((value as DiagramSpec).edges)
  );
}

export function parseCanvasDiagrams(stored: unknown): CanvasDiagram[] {
  if (!stored || typeof stored !== "object") return [];

  const list = (stored as { diagrams?: CanvasDiagram[] }).diagrams;
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) =>
    entry && typeof entry.id === "string" && isDiagramSpec(entry.spec)
      ? [{ id: entry.id, title: entry.spec.title ?? entry.title ?? "Untitled", spec: entry.spec }]
      : [],
  );
}

export function upsertCanvasDiagram(
  current: CanvasDiagram[],
  next: CanvasDiagram,
): CanvasDiagram[] {
  const without = current.filter((diagram) => diagram.id !== next.id);
  return [...without, next];
}

export function serializeCanvasDiagrams(diagrams: CanvasDiagram[]) {
  return { diagrams };
}

export function toPromptDiagrams(diagrams: CanvasDiagram[]) {
  return diagrams
    .filter((diagram) => diagram.id.length > 0)
    .slice(-MAX_PROMPT_DIAGRAMS)
    .map((diagram) => ({ id: diagram.id, spec: diagram.spec }));
}
