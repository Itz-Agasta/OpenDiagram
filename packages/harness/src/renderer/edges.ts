import type { Box } from "../geometry.js";
import { edgeLabelText } from "../measure.js";
import type { DiagramEdge } from "../schema.js";
import type { RenderSkeleton } from "../skeleton.js";
import type { Theme } from "../theme/index.js";

// ERD relationships: cardinality wins over explicit arrowheads — crow-foot
// notation on both ends ("many" side gets the fork).
const CROWFEET: Record<
  NonNullable<DiagramEdge["cardinality"]>,
  ["crowfoot_one" | "crowfoot_many", "crowfoot_one" | "crowfoot_many"]
> = {
  "one-to-one": ["crowfoot_one", "crowfoot_one"],
  "one-to-many": ["crowfoot_one", "crowfoot_many"],
  "many-to-one": ["crowfoot_many", "crowfoot_one"],
  "many-to-many": ["crowfoot_many", "crowfoot_many"],
};

/** Arrow along ELK's exact orthogonal route, plus its inline label chip. */
export function renderEdge(
  edge: DiagramEdge & { id: string },
  route: { points: { x: number; y: number }[]; label?: Box },
  theme: Theme,
  out: RenderSkeleton[],
): void {
  const [start, ...rest] = route.points;
  if (!start || rest.length === 0) return;
  const strokeStyle = edge.style ?? theme.edge.kind[edge.kind ?? "sync"];
  // "arrow" from the spec means "the default head" — each theme picks its own.
  const defaultHead = theme.edge.arrowhead;
  const normalizeHead = (head: "none" | "arrow" | "circle" | "bar") =>
    head === "arrow" ? defaultHead : head;
  const cardinalityHeads = edge.cardinality ? CROWFEET[edge.cardinality] : undefined;
  out.push({
    kind: "arrow",
    id: edge.id,
    x: start.x,
    y: start.y,
    // ELK's orthogonal route, bends included — labels were measured against
    // this exact path, so it must be drawn verbatim.
    points: [[0, 0], ...rest.map((p): [number, number] => [p.x - start.x, p.y - start.y])],
    startId: edge.from,
    endId: edge.to,
    strokeColor:
      edge.kind === "error"
        ? theme.edge.errorStroke
        : edge.kind === "success"
          ? theme.edge.successStroke
          : theme.edge.stroke,
    strokeStyle,
    strokeWidth: theme.edge.strokeWidth,
    roughness: theme.edge.roughness,
    startArrowhead:
      cardinalityHeads?.[0] ??
      (edge.startArrowhead
        ? normalizeHead(edge.startArrowhead)
        : edge.direction === "bi"
          ? defaultHead
          : "none"),
    endArrowhead:
      cardinalityHeads?.[1] ?? (edge.endArrowhead ? normalizeHead(edge.endArrowhead) : defaultHead),
  });

  const text = edgeLabelText(edge);
  if (text && route.label) {
    const groupId = crypto.randomUUID();
    // Labels sit inline on the arrow path — a solid backing rect masks the
    // line behind the text (eraser.io style).
    out.push({
      kind: "container",
      id: `${edge.id}-label-bg`,
      shape: "rectangle",
      ...route.label,
      strokeColor: "transparent",
      backgroundColor: theme.edge.labelBackground,
      strokeStyle: "solid",
      strokeWidth: 1,
      roughness: theme.roughness,
      groupId,
    });
    out.push({
      kind: "text",
      id: `${edge.id}-label`,
      text,
      // Center anchor — keeps the text inside its backing rect.
      x: route.label.x + route.label.width / 2,
      y: route.label.y + 2,
      fontSize: theme.text.edgeLabel.size,
      fontFamily: theme.fontFamily,
      color: theme.text.edgeLabel.color,
      textAlign: "center",
      groupId,
    });
  }
}
