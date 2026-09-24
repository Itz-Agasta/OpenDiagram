import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { Box } from "../geometry.js";
import { containerTitleBox, nodeSize } from "../measure.js";
import type { DiagramSpec } from "../schema.js";
import type { Theme } from "../theme/index.js";
import { BASE_OPTIONS, edgeLabelSize, elk } from "./elk-common.js";
import type { LayoutGeometry } from "./macro.js";
import type { Sanitized } from "./sanitize.js";

// Band chrome: side padding, gap between stacked nodes. The title row on top
// is sized per diagram (laneLayout).
const PAD = 28;
const ROW_GAP = 40;
// Column gap before label room is added: arrow plus arrowhead.
const COL_GAP = 64;

/**
 * Swimlanes: each group is a full-width band, stacked in spec order, and flow
 * runs along the bands. One flat ELK run (lanes ignored) decides the flow
 * column of every node, so a hand-off between roles is one step right, never a
 * jump across a grid of boxes; the row inside a band follows ELK's order.
 * Every node gets the diagram's largest footprint, which is what makes a
 * process read as a grid. Returns null unless every node sits in exactly one
 * top-level group and there are no zones.
 */
export async function laneLayout(
  spec: DiagramSpec,
  s: Sanitized,
  theme: Theme,
): Promise<LayoutGeometry | null> {
  if (s.zones.length > 0 || s.groups.length < 2 || spec.nodes.some((n) => !s.nodeParent.has(n.id)))
    return null;
  const vertical = spec.meta?.direction === "TB" || spec.meta?.direction === "BT";
  const sizes = spec.nodes.map((n) => nodeSize(n, theme, true));
  const W = Math.max(...sizes.map((z) => z.width));
  const H = Math.max(...sizes.map((z) => z.height));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      ...BASE_OPTIONS,
      "elk.direction": vertical ? "DOWN" : "RIGHT",
      // A process is authored in the order it runs; loops back to an earlier
      // step are the back edges, not whatever the default heuristic picks.
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
    },
    children: spec.nodes.map((n) => ({ id: n.id, width: W, height: H })),
    edges: s.edges
      .filter((e) => e.from !== e.to)
      .map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };
  const out = await elk.layout(graph);
  const flow = (c: ElkNode) => Math.round((vertical ? c.y : c.x) ?? 0);
  const cross = (c: ElkNode) => (vertical ? c.x : c.y) ?? 0;
  const ranks = [...new Set(out.children!.map(flow))].sort((a, b) => a - b);
  const col = new Map(out.children!.map((c) => [c.id, ranks.indexOf(flow(c))]));
  const order = new Map(out.children!.map((c) => [c.id, cross(c)]));

  // Each gap between flow columns fits the widest label crossing it.
  const gaps = ranks.map(() => COL_GAP);
  for (const e of s.edges) {
    const [a, b] = [col.get(e.from)!, col.get(e.to)!];
    const label = edgeLabelSize(e, theme);
    if (!label || a === b) continue;
    const need = (vertical ? label.height : label.width) + COL_GAP;
    // One gap holds the chip: the one leaving the earlier column. Widening
    // every gap a long edge crosses cost 3x its label on a 4-column jump.
    const c = Math.min(a, b);
    gaps[c] = Math.max(gaps[c]!, need);
  }
  const start: number[] = [];
  let at = PAD;
  for (let c = 0; c < ranks.length; c++) {
    start.push(at);
    at += (vertical ? H : W) + gaps[c]!;
  }
  const length = at - gaps[ranks.length - 1]! + PAD;

  // One title row for every lane, as tall as the tallest drawn title: 44 for one line.
  const named = new Map((spec.groups ?? []).map((g) => [g.id, g]));
  const titleOf = (id: string) => containerTitleBox(named.get(id) ?? { label: "" }, theme);
  const titleRow = 18 + Math.max(...s.groups.map((g) => titleOf(g.id).height));

  const positions: Record<string, Box> = {};
  const groupBoxes: Record<string, Box> = {};
  let offset = 0;
  for (const lane of s.groups) {
    const byCol = new Map<number, string[]>();
    for (const id of lane.contains)
      byCol.set(col.get(id)!, [...(byCol.get(col.get(id)!) ?? []), id]);
    const depth = Math.max(1, ...[...byCol.values()].map((v) => v.length));
    for (const [c, ids] of byCol) {
      ids.sort((a, b) => order.get(a)! - order.get(b)!);
      ids.forEach((id, k) => {
        const along = start[c]!;
        const across = offset + (vertical ? PAD : titleRow) + k * ((vertical ? W : H) + ROW_GAP);
        positions[id] = vertical
          ? { x: across, y: along + titleRow, width: W, height: H }
          : { x: along, y: across, width: W, height: H };
      });
    }
    const content =
      (vertical ? PAD * 2 : titleRow + PAD) + depth * (vertical ? W : H) + (depth - 1) * ROW_GAP;
    // A vertical lane is also as wide as its title, or the name spills into the next lane.
    const titleWidth = titleOf(lane.id).width + PAD * 2;
    const thickness = vertical ? Math.max(content, titleWidth) : content;
    groupBoxes[lane.id] = vertical
      ? { x: offset, y: 0, width: thickness, height: length + titleRow }
      : { x: 0, y: offset, width: length, height: thickness };
    offset += thickness;
  }
  // RL and BT: lay out forward, then mirror along the flow. Lanes span the
  // whole flow axis, so only nodes move.
  const reverse = spec.meta?.direction === "RL" || spec.meta?.direction === "BT";
  if (reverse) {
    const end = vertical ? length + titleRow : length;
    for (const [id, b] of Object.entries(positions)) {
      positions[id] = vertical
        ? { ...b, y: end + titleRow - b.y - b.height }
        : { ...b, x: end - b.x - b.width };
    }
  }
  return { positions, groupBoxes, zoneBoxes: {} };
}
