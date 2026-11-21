import type { DiagramSpec } from "../schema.js";
import type { Theme } from "../theme/index.js";
import { memberArea } from "./elk-common.js";
import type { LayoutGeometry } from "./macro.js";
import type { Sanitized } from "./sanitize.js";

// Column-alignment nudge cap (px). ELK left-aligns nodes within a layer, so
// nodes with different label widths end up with visually offset centers.
// Snaps stay small: this is polish, never rearrangement.
const MAX_ALIGN_SNAP = 24;

/**
 * Post-layout polish: nodes sharing a layer ("column" in LR flows, "row" in
 * TB) get their centers snapped to the column mean. Fixes the "Product DB
 * sits 15px left of Order DB" class of visual noise. Runs before routing.
 */
export function alignColumns(
  spec: DiagramSpec,
  geo: LayoutGeometry,
  s: Sanitized,
  theme: Theme,
): void {
  const positions = geo.positions;
  const direction = spec.meta?.direction ?? (spec.type === "erd" ? "TB" : "LR");
  const axis = direction === "LR" || direction === "RL" ? ("x" as const) : ("y" as const);
  const size = axis === "x" ? ("width" as const) : ("height" as const);

  // Layers never overlap along the flow axis (inter-layer spacing is large),
  // so a sweep that chains overlapping ranges recovers the columns.
  const sorted = Object.keys(positions).sort((a, b) => positions[a]![axis] - positions[b]![axis]);
  const clusters: string[][] = [];
  let current: string[] = [];
  let currentEnd = -Infinity;
  for (const id of sorted) {
    const box = positions[id]!;
    if (current.length > 0 && box[axis] <= currentEnd) {
      current.push(id);
      currentEnd = Math.max(currentEnd, box[axis] + box[size]);
    } else {
      if (current.length > 1) clusters.push(current);
      current = [id];
      currentEnd = box[axis] + box[size];
    }
  }
  if (current.length > 1) clusters.push(current);

  const deltas = new Map<string, number>();
  for (const cluster of clusters) {
    const centers = cluster.map((id) => positions[id]![axis] + positions[id]![size] / 2);
    const target = centers.reduce((a, b) => a + b, 0) / centers.length;
    cluster.forEach((id, i) => {
      const delta = target - centers[i]!;
      if (delta !== 0 && Math.abs(delta) <= MAX_ALIGN_SNAP) deltas.set(id, delta);
    });
  }
  // A contained node stays in its frame's member area. The cap alone is not
  // enough: in TB the top padding holds the title, and groups laid out apart
  // (two-phase fold) snap far enough to land a node on it.
  const named = new Map([...(spec.groups ?? []), ...(spec.zones ?? [])].map((c) => [c.id, c]));
  for (const [id, delta] of deltas) {
    const box = positions[id]!;
    const parent = s.nodeParent.get(id);
    const frame = parent ? (geo.groupBoxes[parent] ?? geo.zoneBoxes[parent]) : undefined;
    if (!frame) {
      box[axis] += delta;
      continue;
    }
    const area = memberArea(frame, named.get(parent!) ?? { label: "" }, theme);
    const lo = Math.min(0, area[axis] - box[axis]);
    const hi = Math.max(0, area[axis] + area[size] - box[size] - box[axis]);
    box[axis] += Math.min(Math.max(delta, lo), hi);
  }
}
