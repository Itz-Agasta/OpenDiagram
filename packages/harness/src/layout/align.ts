import type { Box, EdgeRoute } from "../geometry.js";
import type { DiagramEdge, DiagramSpec } from "../schema.js";

// Column-alignment nudge cap (px). ELK left-aligns nodes within a layer, so
// nodes with different label widths end up with visually offset centers.
// Snaps stay small — this is polish, never rearrangement — and stay within a
// container's padding so nodes can't poke out of their group box.
const MAX_ALIGN_SNAP = 24;

/**
 * Post-layout polish: nodes sharing a layer ("column" in LR flows, "row" in
 * TB) get their centers snapped to the column mean, and the touching edge
 * endpoints shift with them so routes stay orthogonal. Fixes the "Product DB
 * sits 15px left of Order DB" class of visual noise.
 */
export function alignColumns(
  spec: DiagramSpec,
  edges: (DiagramEdge & { id: string })[],
  positions: Record<string, Box>,
  edgeRoutes: Record<string, EdgeRoute>,
): void {
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
  if (deltas.size === 0) return;

  for (const [id, delta] of deltas) positions[id]![axis] += delta;

  // Keep routes orthogonal: the endpoint touching a moved node shifts with
  // it; when the terminal segment runs perpendicular to the flow (constant
  // snap-axis coordinate), its other end shifts too so the segment stays
  // straight.
  for (const edge of edges) {
    const route = edgeRoutes[edge.id];
    if (!route || route.points.length < 2) continue;
    const dFrom = deltas.get(edge.from) ?? 0;
    const dTo = deltas.get(edge.to) ?? 0;
    if (dFrom === 0 && dTo === 0) continue;
    const pts = route.points;
    const first = pts[0]!;
    const second = pts[1]!;
    const last = pts[pts.length - 1]!;
    const penultimate = pts[pts.length - 2]!;
    if (pts.length === 2 && first[axis] === last[axis]) {
      // Straight perpendicular segment between two column-mates: shift the
      // whole segment by the average so it stays straight (bound endpoints
      // re-snap to the node borders on canvas anyway).
      const mid = (dFrom + dTo) / 2;
      first[axis] += mid;
      last[axis] += mid;
      continue;
    }
    if (dFrom !== 0) {
      if (first[axis] === second[axis]) second[axis] += dFrom;
      first[axis] += dFrom;
    }
    if (dTo !== 0) {
      if (last[axis] === penultimate[axis]) penultimate[axis] += dTo;
      last[axis] += dTo;
    }
  }
}
