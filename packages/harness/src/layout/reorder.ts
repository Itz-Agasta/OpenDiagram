import type { Box } from "../geometry.js";
import type { DiagramEdge } from "../schema.js";
import type { LayoutGeometry } from "./macro.js";
import type { Sanitized } from "./sanitize.js";

// Barycenter sweeps. Two passes each way settle every corpus case we have.
const SWEEPS = 4;

/**
 * Cross-block crossing reduction for the fold. Each fold block is laid out on
 * its own, so a stack of unconnected siblings ("Application Services": five
 * services, no edges between them) keeps ELK's arbitrary order while its
 * neighbours sit elsewhere; measured 18 crossings on LinkedIn. Such stacks are
 * re-sorted by the mean cross-axis position of what they connect to, reusing
 * the same slots so nothing moves out of its container.
 */
export function reorderStacks(
  geo: LayoutGeometry,
  s: Sanitized,
  edges: DiagramEdge[],
  horizontal: boolean,
): void {
  const pos = geo.positions;
  const across = (b: Box) => (horizontal ? b.y + b.height / 2 : b.x + b.width / 2);
  const span = (b: Box): [number, number] =>
    horizontal ? [b.x, b.x + b.width] : [b.y, b.y + b.height];
  const members = new Map<string, string[]>();
  for (const [id, parent] of s.nodeParent)
    members.set(parent, [...(members.get(parent) ?? []), id]);

  const stacks: string[][] = [];
  for (const ids of members.values()) {
    if (ids.length < 2 || !ids.every((id) => pos[id])) continue;
    const inner = new Set(ids);
    if (edges.some((e) => e.from !== e.to && inner.has(e.from) && inner.has(e.to))) continue;
    // One column: every member overlaps every other along the flow axis.
    const spans = ids.map((id) => span(pos[id]!));
    if (Math.max(...spans.map((x) => x[0])) >= Math.min(...spans.map((x) => x[1]))) continue;
    stacks.push(ids);
  }

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (const ids of stacks) {
      const inner = new Set(ids);
      const bary = new Map<string, number>();
      for (const id of ids) {
        const others = edges
          .filter((e) => (e.from === id && !inner.has(e.to)) || (e.to === id && !inner.has(e.from)))
          .map((e) => pos[e.from === id ? e.to : e.from])
          .filter((b): b is Box => !!b);
        bary.set(
          id,
          others.length
            ? others.reduce((a, b) => a + across(b), 0) / others.length
            : across(pos[id]!),
        );
      }
      // Restack from the same start with the stack's own smallest gap, so
      // nodes of different heights never overlap after the shuffle.
      const lo = (b: Box) => (horizontal ? b.y : b.x);
      const len = (b: Box) => (horizontal ? b.height : b.width);
      const byPos = [...ids].sort((a, b) => lo(pos[a]!) - lo(pos[b]!));
      const gap = Math.min(
        ...byPos.slice(1).map((id, k) => lo(pos[id]!) - lo(pos[byPos[k]!]!) - len(pos[byPos[k]!]!)),
      );
      let at = lo(pos[byPos[0]!]!);
      for (const id of [...ids].sort((a, b) => bary.get(a)! - bary.get(b)!)) {
        pos[id] = horizontal ? { ...pos[id]!, y: at } : { ...pos[id]!, x: at };
        at += len(pos[id]!) + gap;
      }
    }
  }
}
