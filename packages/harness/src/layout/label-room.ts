import type { DiagramSpec } from "../schema.js";
import type { Theme } from "../theme/index.js";
import { NODE_GAP, edgeLabelSize } from "./elk-common.js";
import type { LayoutGeometry } from "./macro.js";
import type { Sanitized } from "./sanitize.js";

// A chip needs this much run beyond its own size: the router keeps 10px clear
// at the tail and 18px at the arrowhead, plus a little air.
const RUN_EXTRA = 32;

/**
 * Sibling gaps that would give every label room on its own line, keyed by
 * parent container id ("root" for top level); empty when ELK's gaps already
 * do. ELK reserves label room only between layers, so a labelled edge joining
 * two same-layer neighbours (a replica beside its primary) gets the plain
 * sibling gap and its chip has nowhere to sit. `s` must be the full
 * sanitized spec, not the placement subset: replication edges are left out of
 * placement and are exactly the ones joining two neighbours.
 */
export function labelRoom(
  spec: DiagramSpec,
  s: Sanitized,
  geo: LayoutGeometry,
  theme: Theme,
): Map<string, number> {
  const vertical = ["TB", "BT"].includes(
    spec.meta?.direction ?? (spec.type === "erd" ? "TB" : "LR"),
  );
  const room = new Map<string, number>();
  for (const e of s.edges) {
    const size = edgeLabelSize(e, theme);
    const parent = s.nodeParent.get(e.from) ?? "root";
    if (!size || parent !== (s.nodeParent.get(e.to) ?? "root")) continue;
    const [a, b] = [geo.positions[e.from], geo.positions[e.to]];
    if (!a || !b) continue;
    // Same layer: their spans along the flow overlap. Gap: across the flow.
    const sameLayer = vertical
      ? a.y < b.y + b.height && b.y < a.y + a.height
      : a.x < b.x + b.width && b.x < a.x + a.width;
    if (!sameLayer) continue;
    const gap = vertical
      ? Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width))
      : Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
    const need = (vertical ? size.width : size.height) + RUN_EXTRA;
    if (gap >= need) continue;
    room.set(parent, Math.max(room.get(parent) ?? 0, NODE_GAP + need - gap));
  }
  return room;
}
