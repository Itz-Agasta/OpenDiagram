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

// Corner softening. Excalidraw's own rounding is unusable here: `roundness`
// splines the WHOLE polyline (long runs bow out into noodles), and `elbowed`
// arrows re-route with Excalidraw's router, which discards ELK's path and the
// label positions measured against it. So we bake the corners into the points.
const CORNER_RADIUS = 10;
// Points per corner. 2 is a visible chamfer, 3 reads as an arc; past that the
// arrow gains vertices faster than it gains smoothness, and every vertex is one
// more thing left behind when Excalidraw drags the bound endpoints.
const CORNER_STEPS = 3;

/**
 * Replaces each 90-degree turn with a short arc, preserving the straight runs
 * exactly. Radius shrinks on short segments so two close corners cannot eat
 * each other. Input must be the orthogonal polyline ELK returned.
 */
function roundCorners(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const out: { x: number; y: number }[] = [points[0]!];

  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const inLen = Math.hypot(b.x - a.x, b.y - a.y);
    const outLen = Math.hypot(c.x - b.x, c.y - b.y);
    // Halve so adjacent corners never claim the same stretch of segment.
    const r = Math.min(CORNER_RADIUS, inLen / 2, outLen / 2);
    if (r < 1) {
      out.push(b);
      continue;
    }
    const start = { x: b.x + ((a.x - b.x) / inLen) * r, y: b.y + ((a.y - b.y) / inLen) * r };
    const end = { x: b.x + ((c.x - b.x) / outLen) * r, y: b.y + ((c.y - b.y) / outLen) * r };
    out.push(start);
    // Quadratic Bezier with the corner as control point: for a right angle this
    // is visually indistinguishable from a circular arc and needs no centre.
    for (let s = 1; s < CORNER_STEPS; s++) {
      const t = s / CORNER_STEPS;
      const u = 1 - t;
      out.push({
        x: u * u * start.x + 2 * u * t * b.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * b.y + t * t * end.y,
      });
    }
    out.push(end);
  }

  out.push(points[points.length - 1]!);
  return out;
}

/** Arrow along ELK's exact orthogonal route, plus its inline label chip. */
export function renderEdge(
  edge: DiagramEdge & { id: string },
  route: { points: { x: number; y: number }[]; label?: Box },
  theme: Theme,
  out: RenderSkeleton[],
): void {
  const [start, ...rest] = roundCorners(route.points);
  if (!start || rest.length === 0) return;
  const strokeStyle = edge.style ?? theme.edge.kind[edge.kind ?? "sync"];
  // "arrow" from the spec means "the default head" — each theme picks its own.
  const defaultHead = theme.edge.arrowhead;
  const normalizeHead = (head: "none" | "arrow" | "circle" | "bar") =>
    head === "arrow" ? defaultHead : head;
  const cardinalityHeads = edge.cardinality ? CROWFEET[edge.cardinality] : undefined;
  // Arrow and its label chip share one group so dragging the arrow takes the
  // label with it. Unlabelled arrows stay ungrouped, since a one-member group would
  // make the user click twice to select a single arrow.
  const text = edgeLabelText(edge);
  const groupId = text && route.label ? crypto.randomUUID() : undefined;
  out.push({
    kind: "arrow",
    id: edge.id,
    groupId,
    x: start.x,
    y: start.y,
    // ELK's route, never re-routed: labels were measured against this path.
    // `roundCorners` is the one permitted edit and only ever cuts a corner
    // inward by CORNER_RADIUS, leaving every straight run untouched. Label
    // chips sit on straight runs (0 of 43 corpus labels land within a radius of
    // a bend), so the chip still masks the line it was measured against.
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

  if (text && route.label) {
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
