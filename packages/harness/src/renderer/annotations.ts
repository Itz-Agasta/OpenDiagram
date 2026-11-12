import type { PositionedSpec } from "../geometry.js";
import { estimateTextWidth, wrapLabel } from "../measure.js";
import type { RenderSkeleton } from "../skeleton.js";
import type { Theme } from "../theme/index.js";

const GAP = 48;
const SAMPLE = 56;
const NOTE_WIDTH = 520;

/**
 * Legend and free notes, drawn in a strip under the diagram. The spec carries
 * only their text and edge kind; where they sit and how they look is decided
 * here, like everything else. Runs last so the strip clears every route.
 */
export function renderAnnotations(
  positioned: PositionedSpec,
  theme: Theme,
  out: RenderSkeleton[],
): void {
  const legend = positioned.legend ?? [];
  const notes = positioned.notes ?? [];
  if (legend.length === 0 && notes.length === 0) return;

  const boxes = [
    ...Object.values(positioned.positions),
    ...Object.values(positioned.groupBoxes),
    ...Object.values(positioned.zoneBoxes),
  ];
  const points = Object.values(positioned.edgeRoutes).flatMap((r) => r.points);
  if (boxes.length === 0 && points.length === 0) return;
  // Element ids share one namespace with spec ids; a node called "legend-0" must not collide.
  const tag = crypto.randomUUID().slice(0, 8);
  const left = Math.min(...boxes.map((b) => b.x), ...points.map((p) => p.x));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height), ...points.map((p) => p.y));

  const { size, color } = theme.text.nodeLabel;
  const line = Math.ceil(size * 1.6);
  let x = left;
  const top = bottom + GAP;

  if (legend.length > 0) {
    let width = 0;
    legend.forEach((item, i) => {
      const y = top + i * line + line / 2;
      out.push({
        kind: "arrow",
        id: `legend-${tag}-${i}`,
        x,
        y,
        points: [
          [0, 0],
          [SAMPLE, 0],
        ],
        strokeColor:
          item.kind === "error"
            ? theme.edge.errorStroke
            : item.kind === "success"
              ? theme.edge.successStroke
              : theme.edge.stroke,
        strokeStyle: item.style ?? theme.edge.kind[item.kind ?? "sync"],
        strokeWidth: theme.edge.strokeWidth,
        roughness: theme.edge.roughness,
        startArrowhead: "none",
        endArrowhead: theme.edge.arrowhead,
      });
      out.push({
        kind: "text",
        id: `legend-text-${tag}-${i}`,
        text: item.label,
        x: x + SAMPLE + 12,
        y: y - size * 0.65,
        fontSize: size,
        fontFamily: theme.fontFamily,
        color,
        textAlign: "left",
      });
      width = Math.max(width, SAMPLE + 12 + estimateTextWidth(item.label, size, theme.fontFamily));
    });
    x += width + GAP;
  }

  let y = top;
  notes.forEach((note, i) => {
    const lines = wrapLabel(note, size, theme.fontFamily, NOTE_WIDTH);
    out.push({
      kind: "text",
      id: `note-${tag}-${i}`,
      text: lines.join("\n"),
      x,
      y,
      fontSize: size,
      fontFamily: theme.fontFamily,
      color,
      textAlign: "left",
    });
    y += lines.length * Math.ceil(size * 1.3) + line / 2;
  });
}
