import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { Box } from "../geometry.js";
import { nodeSize } from "../measure.js";
import type { DiagramEdge, DiagramSpec } from "../schema.js";
import type { Theme } from "../theme/index.js";
import { BASE_OPTIONS, containerOptions, elk, elkEdge } from "./elk-common.js";
import type { Sanitized } from "./sanitize.js";

/**
 * Two-phase "fold" layout for diagrams with several top-level containers.
 *
 * Single-run layered ELK ranks every node along ONE axis, so architecture
 * diagrams with a chain of groups (entry -> core -> async -> storage) come out
 * as a 4:1 ribbon. Humans fix that by treating each group as a block and
 * packing blocks into a compact 2D grid. This module does the same:
 *
 *   1. micro: ELK lays out each top-level block's interior independently
 *   2. macro: blocks get grid cells: longest-path column rank, then whole
 *      columns greedily merge (stack) until the canvas approaches TARGET_ASPECT
 *
 * Placement only: the router draws every edge afterwards, through the gutters
 * sized here. The caller routes both this and the single-run layout and keeps
 * the better one, so this path can only improve a diagram, never regress it.
 */

export interface LayoutGeometry {
  positions: Record<string, Box>;
  groupBoxes: Record<string, Box>;
  zoneBoxes: Record<string, Box>;
}

type SanEdge = DiagramEdge & { id: string };

interface Block {
  id: string;
  kind: "zone" | "group" | "node";
  members: Set<string>;
  width: number;
  height: number;
  inner: LayoutGeometry; // coordinates relative to the block's top-left
  col: number;
  row: number;
  /** Flow rank before folding; the grid may move `col`, never this. */
  rank: number;
  x: number;
  y: number;
}

// TUNABLE: fold target and grid spacing.
const TARGET_ASPECT = 1.9; // slightly wide reads best on screens
const ROW_GAP = 100; // vertical gap between stacked blocks in a column
const GUTTER_BASE = 100; // minimum gutter between columns
const LANE_SPACING = 30; // extra gutter width per routed edge lane
/** Block-pair key. NUL-joined: ids are free text and may contain spaces. */
const pairKey = (a: string, b: string) => `${a}\u0000${b}`;
// A block wider than this many heights gets its interior re-laid top-down.
const WIDE_BLOCK = 2;

export async function twoPhaseLayout(
  spec: DiagramSpec,
  s: Sanitized,
  theme: Theme,
): Promise<LayoutGeometry | null> {
  const nodeById = new Map(spec.nodes.map((n) => [n.id, n]));

  // --- top-level blocks: zones, groups outside zones, loose nodes ---
  const groupsInZones = new Set(s.zones.flatMap((z) => z.contains));
  const blocks: Block[] = [];
  const blockOf = new Map<string, Block>();
  const addBlock = (id: string, kind: Block["kind"], members: string[]) => {
    const block: Block = {
      id,
      kind,
      members: new Set(members),
      width: 0,
      height: 0,
      inner: { positions: {}, groupBoxes: {}, zoneBoxes: {} },
      col: 0,
      row: 0,
      rank: 0,
      x: 0,
      y: 0,
    };
    for (const m of members) blockOf.set(m, block);
    blocks.push(block);
    return block;
  };

  for (const zone of s.zones) {
    const members = zone.contains.flatMap(
      (id) => s.groups.find((g) => g.id === id)?.contains ?? [id],
    );
    addBlock(zone.id, "zone", members);
  }
  for (const group of s.groups) {
    if (!groupsInZones.has(group.id)) addBlock(group.id, "group", group.contains);
  }
  for (const node of spec.nodes) {
    if (!s.nodeParent.has(node.id)) addBlock(node.id, "node", [node.id]);
  }
  if (blocks.filter((b) => b.kind !== "node").length < 2) return null;

  // --- phase 1: micro layout per block ---
  for (const block of blocks) {
    if (block.kind === "node") {
      const node = nodeById.get(block.id)!;
      const size = nodeSize(node, theme, false);
      block.width = size.width;
      block.height = size.height;
      block.inner.positions[block.id] = { x: 0, y: 0, ...size };
      continue;
    }
    await microLayout(block, spec, s, theme, nodeById, "RIGHT");
    // A tier laid out as a long row makes the whole diagram a ribbon. Stood
    // on end it becomes a column, the way hand-drawn diagrams show a tier:
    // blocks still flow left to right, the tier's own chain reads downward.
    if (block.members.size > 1 && block.width > block.height * WIDE_BLOCK) {
      block.inner = { positions: {}, groupBoxes: {}, zoneBoxes: {} };
      await microLayout(block, spec, s, theme, nodeById, "DOWN");
    }
  }

  // --- phase 2: grid assignment + placement ---
  const qEdges = s.edges.filter((e) => blockOf.get(e.from) !== blockOf.get(e.to));
  assignColumns(blocks, qEdges, blockOf);
  const cols = foldColumns(blocks);
  refineGrid(cols, qEdges, blockOf);
  placeBlocks(cols, qEdges, blockOf);

  // --- assemble absolute geometry ---
  const geo: LayoutGeometry = { positions: {}, groupBoxes: {}, zoneBoxes: {} };
  for (const block of blocks) {
    if (block.kind === "zone") {
      geo.zoneBoxes[block.id] = {
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
      };
    } else if (block.kind === "group") {
      geo.groupBoxes[block.id] = {
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
      };
    }
    for (const [id, b] of Object.entries(block.inner.positions)) {
      geo.positions[id] = { ...b, x: b.x + block.x, y: b.y + block.y };
    }
    for (const [id, b] of Object.entries(block.inner.groupBoxes)) {
      geo.groupBoxes[id] = { ...b, x: b.x + block.x, y: b.y + block.y };
    }
  }

  return geo;
}

/** ELK layout of one container's interior; sizes the block, coords relative. */
async function microLayout(
  block: Block,
  spec: DiagramSpec,
  s: Sanitized,
  theme: Theme,
  nodeById: Map<string, DiagramSpec["nodes"][number]>,
  direction: "RIGHT" | "DOWN",
): Promise<void> {
  const named = new Map([...(spec.groups ?? []), ...(spec.zones ?? [])].map((c) => [c.id, c]));
  const options = (id: string) =>
    containerOptions(named.get(id) ?? { label: "" }, theme, direction === "DOWN");
  const elkNodes = new Map<string, ElkNode>();
  for (const id of block.members) {
    elkNodes.set(id, { id, ...nodeSize(nodeById.get(id)!, theme, true) });
  }
  let containerChildren: ElkNode[];
  const innerGroupIds = new Set<string>();
  if (block.kind === "zone") {
    const zone = s.zones.find((z) => z.id === block.id)!;
    containerChildren = zone.contains.map((id) => {
      const group = s.groups.find((g) => g.id === id);
      if (!group) return elkNodes.get(id)!;
      innerGroupIds.add(group.id);
      return {
        id: group.id,
        layoutOptions: options(group.id),
        children: group.contains.map((n) => elkNodes.get(n)!),
      };
    });
  } else {
    const group = s.groups.find((g) => g.id === block.id)!;
    containerChildren = group.contains.map((n) => elkNodes.get(n)!);
  }
  const intraEdges = s.edges.filter((e) => block.members.has(e.from) && block.members.has(e.to));
  const laidOut = await elk.layout({
    id: "root",
    layoutOptions: { ...BASE_OPTIONS, "elk.direction": direction },
    children: [{ id: block.id, layoutOptions: options(block.id), children: containerChildren }],
    edges: intraEdges.map((e) => elkEdge(e, theme)),
  });
  const container = laidOut.children![0]!;
  block.width = container.width ?? 0;
  block.height = container.height ?? 0;
  const walk = (node: ElkNode, offX: number, offY: number) => {
    for (const child of node.children ?? []) {
      const box: Box = {
        x: offX + (child.x ?? 0),
        y: offY + (child.y ?? 0),
        width: child.width ?? 0,
        height: child.height ?? 0,
      };
      if (innerGroupIds.has(child.id)) block.inner.groupBoxes[child.id] = box;
      else block.inner.positions[child.id] = box;
      walk(child, box.x, box.y);
    }
  };
  walk(container, 0, 0);
}

/** Longest-path column rank over the block quotient graph (cycle-bounded). */
function assignColumns(blocks: Block[], qEdges: SanEdge[], blockOf: Map<string, Block>): void {
  const pairs: [Block, Block][] = [];
  const seen = new Set<string>();
  for (const e of qEdges) {
    const a = blockOf.get(e.from)!;
    const b = blockOf.get(e.to)!;
    const key = `${a.id} ${b.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push([a, b]);
    }
  }
  // Drop feedback edges first. DFS starts at blocks nothing points to, then
  // follows authored order, so in the common shape (a source feeding a system
  // that sends alerts back) the return edge is the one dropped. A cycle with
  // no such source is broken wherever authored order meets it first.
  const out = new Map<Block, Block[]>();
  for (const [a, b] of pairs) out.set(a, [...(out.get(a) ?? []), b]);
  const pointed = new Set(pairs.map(([, b]) => b));
  const state = new Map<Block, "open" | "done">();
  const feedback = new Set<string>();
  const visit = (a: Block) => {
    state.set(a, "open");
    for (const b of out.get(a) ?? []) {
      if (state.get(b) === "open") feedback.add(pairKey(a.id, b.id));
      else if (!state.has(b)) visit(b);
    }
    state.set(a, "done");
  };
  for (const block of [...blocks.filter((b) => !pointed.has(b)), ...blocks])
    if (!state.has(block)) visit(block);
  const forward = pairs.filter(([a, b]) => !feedback.has(pairKey(a.id, b.id)));

  for (const block of blocks) block.col = 0;
  // Bounded relaxation: terminates even if the quotient graph has a cycle.
  for (let i = 0; i < blocks.length; i++) {
    let changed = false;
    for (const [a, b] of forward) {
      if (b.col < a.col + 1) {
        b.col = a.col + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  // compress empty columns
  const used = [...new Set(blocks.map((b) => b.col))].sort((x, y) => x - y);
  const remap = new Map(used.map((c, i) => [c, i]));
  for (const block of blocks) block.col = block.rank = remap.get(block.col)!;
}

/** Greedily merge whole columns (stacking their blocks) toward TARGET_ASPECT. */
function foldColumns(blocks: Block[]): Block[][] {
  let cols: Block[][] = [];
  for (const block of blocks) {
    (cols[block.col] ??= []).push(block);
  }
  cols = cols.filter((c) => c && c.length > 0);

  const GUTTER_EST = GUTTER_BASE + LANE_SPACING * 2;
  const badness = (candidate: Block[][]) => {
    const width =
      candidate.reduce((sum, col) => sum + Math.max(...col.map((b) => b.width)), 0) +
      GUTTER_EST * (candidate.length - 1);
    const height = Math.max(
      ...candidate.map(
        (col) => col.reduce((sum, b) => sum + b.height, 0) + ROW_GAP * (col.length - 1),
      ),
    );
    return Math.abs(Math.log(width / height / TARGET_ASPECT));
  };

  for (let iter = 0; iter < 8 && cols.length > 2; iter++) {
    const current = badness(cols);
    let best: { cols: Block[][]; badness: number } | undefined;
    for (let ci = 0; ci < cols.length; ci++) {
      for (const ti of [ci - 1, ci + 1]) {
        if (ti < 0 || ti >= cols.length) continue;
        // Earlier rank stacks on top, so a folded diagram still reads like
        // text: left to right, then down. Appending it below made a source
        // zone sit under its consumers with every edge climbing back up.
        const merged = cols
          .map((col, i) =>
            i === ti ? (ci < ti ? [...cols[ci]!, ...col] : [...col, ...cols[ci]!]) : col,
          )
          .filter((_, i) => i !== ci);
        const b = badness(merged);
        if (b < current - 1e-9 && (!best || b < best.badness)) best = { cols: merged, badness: b };
      }
    }
    if (!best) break;
    cols = best.cols;
  }

  cols.forEach((col, c) =>
    col.forEach((block, r) => {
      block.col = c;
      block.row = r;
    }),
  );
  return cols;
}

/**
 * Adjacency refinement: pairwise-swap blocks between grid slots while that
 * shortens the quotient edges. The fold decides the grid SHAPE; this pass
 * decides which block sits where, so heavily connected blocks (the "core"
 * hub) end up next to their partners instead of wherever the longest-path
 * rank left them.
 */
function refineGrid(cols: Block[][], qEdges: SanEdge[], blockOf: Map<string, Block>): void {
  const weight = new Map<string, number>();
  const pairs: [Block, Block][] = [];
  const directed: [Block, Block][] = [];
  for (const e of qEdges) {
    const a = blockOf.get(e.from)!;
    const b = blockOf.get(e.to)!;
    // Only edges that run forward in rank carry the reading direction; the
    // feedback edges cycle-breaking dropped would contradict it either way.
    if (a.rank < b.rank) directed.push([a, b]);
    const key = a.id < b.id ? pairKey(a.id, b.id) : pairKey(b.id, a.id);
    if (!weight.has(key)) pairs.push([a, b]);
    weight.set(key, (weight.get(key) ?? 0) + 1);
  }
  if (pairs.length === 0) return;

  // Cheap stand-in for scoreLayout: multiplicity-weighted center-to-center
  // edge length, plus the aspect term at scoreLayout's own exchange rate
  // (700 per log-unit vs 0.04 per px) so swaps can't undo the fold's shape.
  const centers = new Map<Block, { x: number; y: number }>();
  const measure = () => {
    centers.clear();
    let x = 0;
    let maxY = 0;
    for (const col of cols) {
      const colWidth = Math.max(...col.map((b) => b.width));
      let y = 0;
      for (const b of col) {
        centers.set(b, { x: x + colWidth / 2, y: y + b.height / 2 });
        y += b.height + ROW_GAP;
      }
      maxY = Math.max(maxY, y - ROW_GAP);
      x += colWidth + GUTTER_BASE + LANE_SPACING * 2;
    }
    const aspect = (x - GUTTER_BASE - LANE_SPACING * 2) / Math.max(maxY, 1);
    let cost = (700 / 0.04) * Math.abs(Math.log(aspect / TARGET_ASPECT));
    for (const [a, b] of pairs) {
      const ca = centers.get(a)!;
      const cb = centers.get(b)!;
      const key = a.id < b.id ? pairKey(a.id, b.id) : pairKey(b.id, a.id);
      cost += weight.get(key)! * (Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y));
    }
    // Flow runs left to right, then down. An edge into an earlier column, or
    // up within a column, reads backwards; compared before cost, so reading
    // order is never traded for shorter edges.
    let back = 0;
    for (const [a, b] of directed) {
      const ca = centers.get(a)!;
      const cb = centers.get(b)!;
      if (cb.x < ca.x - 1 || (Math.abs(cb.x - ca.x) <= 1 && cb.y < ca.y)) back++;
    }
    return { back, cost };
  };

  const slotOf = new Map<Block, [number, number]>();
  cols.forEach((col, c) => col.forEach((block, r) => slotOf.set(block, [c, r])));
  const swap = (a: Block, b: Block) => {
    const [ac, ar] = slotOf.get(a)!;
    const [bc, br] = slotOf.get(b)!;
    cols[ac]![ar] = b;
    cols[bc]![br] = a;
    slotOf.set(a, [bc, br]);
    slotOf.set(b, [ac, ar]);
  };

  const flat = cols.flat();
  let best = measure();
  for (let sweep = 0; sweep < 4; sweep++) {
    let improved = false;
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        swap(flat[i]!, flat[j]!);
        const next = measure();
        if (next.back < best.back || (next.back === best.back && next.cost < best.cost - 1e-6)) {
          best = next;
          improved = true;
        } else {
          swap(flat[i]!, flat[j]!);
        }
      }
    }
    if (!improved) break;
  }
  cols.forEach((col, c) =>
    col.forEach((block, r) => {
      block.col = c;
      block.row = r;
    }),
  );
}

/** Absolute block positions; gutters widen with the edges that will cross them. */
function placeBlocks(cols: Block[][], qEdges: SanEdge[], blockOf: Map<string, Block>): void {
  const laneCount = Array.from({ length: Math.max(cols.length - 1, 0) }, () => 0);
  for (const e of qEdges) {
    const a = blockOf.get(e.from)!;
    const b = blockOf.get(e.to)!;
    if (a.col === b.col) {
      if (Math.abs(a.row - b.row) > 1 && a.col < laneCount.length) laneCount[a.col]!++;
      continue;
    }
    const [lo, hi] = a.col < b.col ? [a.col, b.col] : [b.col, a.col];
    laneCount[lo]!++;
    if (hi - lo > 1) laneCount[hi - 1]!++;
  }

  let x = 0;
  cols.forEach((col, c) => {
    const colWidth = Math.max(...col.map((b) => b.width));
    let y = 0;
    for (const block of col) {
      // Left-aligned: a stacked block starts where the column starts, so an
      // edge down into it never reads as flowing backwards.
      block.x = x;
      block.y = y;
      y += block.height + ROW_GAP;
    }
    x += colWidth + GUTTER_BASE + LANE_SPACING * (laneCount[c] ?? 0);
  });
}
