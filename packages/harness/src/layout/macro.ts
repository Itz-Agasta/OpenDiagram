import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { Box, EdgeRoute } from "../geometry.js";
import {
  countTextLines,
  edgeLabelText,
  estimateTextHeight,
  estimateTextWidth,
  nodeSize,
} from "../measure.js";
import type { DiagramEdge, DiagramSpec } from "../schema.js";
import type { Theme } from "../theme/index.js";
import { BASE_OPTIONS, CONTAINER_OPTIONS, elk, elkEdge } from "./elk-common.js";
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
 *   2. macro: blocks get grid cells — longest-path column rank, then whole
 *      columns greedily merge (stack) until the canvas approaches TARGET_ASPECT
 *   3. route: inter-block edges run orthogonally through reserved gutter lanes
 *
 * The caller scores this result against the single-run layout and keeps the
 * better one, so this path can only improve a diagram, never regress it.
 */

export interface LayoutGeometry {
  positions: Record<string, Box>;
  groupBoxes: Record<string, Box>;
  zoneBoxes: Record<string, Box>;
  edgeRoutes: Record<string, EdgeRoute>;
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
  x: number;
  y: number;
}

// TUNABLE: fold target and grid spacing.
const TARGET_ASPECT = 1.9; // slightly wide reads best on screens
const ROW_GAP = 100; // vertical gap between stacked blocks in a column
const GUTTER_BASE = 100; // minimum gutter between columns
const LANE_SPACING = 30; // extra gutter width per routed edge lane
const APPROACH = 36; // stand-off for north/south block entries

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
      inner: { positions: {}, groupBoxes: {}, zoneBoxes: {}, edgeRoutes: {} },
      col: 0,
      row: 0,
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
    await microLayout(block, s, theme, nodeById);
  }

  // --- phase 2: grid assignment + placement ---
  const qEdges = s.edges.filter((e) => blockOf.get(e.from) !== blockOf.get(e.to));
  assignColumns(blocks, qEdges, blockOf);
  const cols = foldColumns(blocks);
  refineGrid(cols, qEdges, blockOf);
  const gutters = placeBlocks(cols, qEdges, blockOf);

  // --- assemble absolute geometry ---
  const geo: LayoutGeometry = { positions: {}, groupBoxes: {}, zoneBoxes: {}, edgeRoutes: {} };
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
    for (const [id, route] of Object.entries(block.inner.edgeRoutes)) {
      geo.edgeRoutes[id] = {
        points: route.points.map((p) => ({ x: p.x + block.x, y: p.y + block.y })),
        label: route.label
          ? { ...route.label, x: route.label.x + block.x, y: route.label.y + block.y }
          : undefined,
      };
    }
  }

  // --- phase 3: route inter-block edges ---
  routeQuotientEdges(qEdges, blockOf, cols, gutters, geo, theme);
  return geo;
}

/** ELK layout of one container's interior; sizes the block, coords relative. */
async function microLayout(
  block: Block,
  s: Sanitized,
  theme: Theme,
  nodeById: Map<string, DiagramSpec["nodes"][number]>,
): Promise<void> {
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
        layoutOptions: CONTAINER_OPTIONS,
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
    layoutOptions: { ...BASE_OPTIONS, "elk.direction": "RIGHT" },
    children: [{ id: block.id, layoutOptions: CONTAINER_OPTIONS, children: containerChildren }],
    edges: intraEdges.map((e) => elkEdge(e, theme)),
  });
  const container = laidOut.children![0]!;
  const ox = container.x ?? 0;
  const oy = container.y ?? 0;
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
  for (const edge of laidOut.edges ?? []) {
    const points = (edge.sections ?? []).flatMap((section) => [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
    if (points.length < 2) continue;
    const label = edge.labels?.[0];
    block.inner.edgeRoutes[edge.id!] = {
      points: points.map((p) => ({ x: p.x - ox, y: p.y - oy })),
      label:
        label?.x !== undefined && label?.y !== undefined
          ? {
              x: label.x - ox,
              y: label.y - oy,
              width: label.width ?? 0,
              height: label.height ?? 0,
            }
          : undefined,
    };
  }
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
  for (const block of blocks) block.col = 0;
  // Bounded relaxation: terminates even if the quotient graph has a cycle.
  for (let i = 0; i < blocks.length; i++) {
    let changed = false;
    for (const [a, b] of pairs) {
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
  for (const block of blocks) block.col = remap.get(block.col)!;
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
        const merged = cols
          .map((col, i) => (i === ti ? [...col, ...cols[ci]!] : col))
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
  for (const e of qEdges) {
    const a = blockOf.get(e.from)!;
    const b = blockOf.get(e.to)!;
    const key = a.id < b.id ? `${a.id} ${b.id}` : `${b.id} ${a.id}`;
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
      const key = a.id < b.id ? `${a.id} ${b.id}` : `${b.id} ${a.id}`;
      cost += weight.get(key)! * (Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y));
    }
    return cost;
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
        const cost = measure();
        if (cost < best - 1e-6) {
          best = cost;
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

interface Gutters {
  /** x where gutter right of column g starts (= right edge of column g). */
  startX: number[];
  laneCount: number[];
}

/** Absolute block positions; gutters widen with the lanes routed through them. */
function placeBlocks(cols: Block[][], qEdges: SanEdge[], blockOf: Map<string, Block>): Gutters {
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

  const startX: number[] = [];
  let x = 0;
  cols.forEach((col, c) => {
    const colWidth = Math.max(...col.map((b) => b.width));
    let y = 0;
    for (const block of col) {
      block.x = x + (colWidth - block.width) / 2;
      block.y = y;
      y += block.height + ROW_GAP;
    }
    startX[c] = x + colWidth;
    x += colWidth + GUTTER_BASE + LANE_SPACING * (laneCount[c] ?? 0);
  });
  return { startX, laneCount };
}

type Side = "W" | "E" | "N" | "S";

interface RoutePlan {
  edge: SanEdge;
  src: Block;
  dst: Block;
  srcBox: Box;
  dstBox: Box;
  kind: "lane" | "overdown" | "gapHop" | "sideLoop";
  srcSide: Side;
  dstSide: Side;
  sy: number; // exit coordinate (y for E/W exits, x for N/S exits)
  ty: number; // entry coordinate (y for E/W entries, x for N/S entries)
}

function routeQuotientEdges(
  qEdges: SanEdge[],
  blockOf: Map<string, Block>,
  cols: Block[][],
  gutters: Gutters,
  geo: LayoutGeometry,
  theme: Theme,
): void {
  const allBlocks = cols.flat();
  const rightmost = Math.max(...allBlocks.map((b) => b.x + b.width));

  // --- classify each edge and pick exit/entry sides ---
  const plans: RoutePlan[] = [];
  for (const edge of qEdges) {
    const src = blockOf.get(edge.from)!;
    const dst = blockOf.get(edge.to)!;
    const srcBox = geo.positions[edge.from]!;
    const dstBox = geo.positions[edge.to]!;
    const scy = srcBox.y + srcBox.height / 2;
    const tcy = dstBox.y + dstBox.height / 2;
    const plan: RoutePlan = {
      edge,
      src,
      dst,
      srcBox,
      dstBox,
      kind: "lane",
      srcSide: "E",
      dstSide: "W",
      sy: scy,
      ty: tcy,
    };
    if (src.col === dst.col) {
      const down = dst.row > src.row;
      const entrySide: Side = down ? "N" : "S";
      if (Math.abs(src.row - dst.row) === 1 && !stubBlocked(dst, geo, dstBox, entrySide, edge.to)) {
        plan.kind = "gapHop";
        plan.srcSide = down ? "S" : "N";
        plan.dstSide = entrySide;
        plan.sy = srcBox.x + srcBox.width / 2;
        plan.ty = dstBox.x + dstBox.width / 2;
      } else {
        plan.kind = "sideLoop";
        plan.srcSide = "E";
        plan.dstSide = "E";
      }
    } else {
      const forward = dst.col > src.col;
      const entrySide: Side = forward ? "W" : "E";
      const hBlocked = stubBlocked(dst, geo, dstBox, entrySide, edge.to);
      // Target well below/above the source block and side entry clear:
      // leave vertically and approach on the target's level (short, no
      // gutter lane, mirrors how humans draw fan-outs to lower groups).
      const below = tcy > src.y + src.height + 30;
      const above = tcy < src.y - 30;
      if (
        (below || above) &&
        !hBlocked &&
        !stubBlocked(src, geo, srcBox, below ? "S" : "N", edge.from) &&
        overdownClear(src, dst, tcy, cols)
      ) {
        plan.kind = "overdown";
        plan.srcSide = below ? "S" : "N";
        plan.dstSide = entrySide;
        plan.sy = srcBox.x + srcBox.width / 2;
      } else if (!hBlocked) {
        plan.kind = "lane";
        plan.srcSide = forward ? "E" : "W";
        plan.dstSide = entrySide;
      } else {
        const vSide: Side = dst.row > src.row || dst.y > src.y ? "N" : "S";
        if (!stubBlocked(dst, geo, dstBox, vSide, edge.to)) {
          plan.kind = "lane";
          plan.srcSide = forward ? "E" : "W";
          plan.dstSide = vSide;
          plan.ty = dstBox.x + dstBox.width / 2;
        } else {
          plan.kind = "sideLoop";
          plan.srcSide = "E";
          plan.dstSide = "E";
        }
      }
    }
    plans.push(plan);
  }

  // --- fan out parallel edges sharing a node side ---
  const fanGroups = new Map<string, RoutePlan[]>();
  const fanKey = (plan: RoutePlan, end: "out" | "in") =>
    end === "out" ? `out:${plan.edge.from}:${plan.srcSide}` : `in:${plan.edge.to}:${plan.dstSide}`;
  for (const plan of plans) {
    for (const end of ["out", "in"] as const) {
      const key = fanKey(plan, end);
      (fanGroups.get(key) ?? fanGroups.set(key, []).get(key)!).push(plan);
    }
  }
  for (const [key, group] of fanGroups) {
    if (group.length < 2) continue;
    const isOut = key.startsWith("out:");
    const side = isOut ? group[0]!.srcSide : group[0]!.dstSide;
    const box = isOut ? group[0]!.srcBox : group[0]!.dstBox;
    const across = side === "E" || side === "W" ? box.height : box.width;
    const step = Math.min(24, (across - 16) / group.length);
    // Deeper targets take the outer offsets so parallel runs don't cross.
    group.sort((a, b) =>
      isOut ? (side === "S" || side === "N" ? b.ty - a.ty : a.ty - b.ty) : a.sy - b.sy,
    );
    group.forEach((plan, i) => {
      const offset = (i - (group.length - 1) / 2) * step;
      if (isOut) plan.sy += offset;
      else plan.ty += offset;
    });
  }

  // --- allocate vertical lanes in gutters ---
  const laneUsers = new Map<number, RoutePlan[]>();
  const claimLane = (g: number, plan: RoutePlan) => {
    const clamped = Math.max(0, Math.min(g, gutters.startX.length - 1));
    (laneUsers.get(clamped) ?? laneUsers.set(clamped, []).get(clamped)!).push(plan);
  };
  for (const plan of plans) {
    const { src, dst } = plan;
    if (plan.kind === "sideLoop") {
      // rightmost column loops through the free margin instead of a gutter
      if (Math.max(src.col, dst.col) < cols.length - 1) claimLane(Math.max(src.col, dst.col), plan);
      continue;
    }
    if (plan.kind !== "lane") continue;
    const [lo, hi] = src.col < dst.col ? [src.col, dst.col] : [dst.col, src.col];
    claimLane(src.col < dst.col ? lo : hi - 1, plan);
    if (hi - lo > 1) claimLane(src.col < dst.col ? hi - 1 : lo, plan);
  }
  const laneX = new Map<string, number>(); // `${gutter}:${edgeId}` -> x
  for (const [g, users] of laneUsers) {
    users.sort((a, b) => a.ty - b.ty);
    users.forEach((plan, i) => {
      laneX.set(`${g}:${plan.edge.id}`, (gutters.startX[g] ?? 0) + 28 + i * LANE_SPACING);
    });
  }
  const laneFor = (g: number, plan: RoutePlan) =>
    laneX.get(`${Math.max(0, Math.min(g, gutters.startX.length - 1))}:${plan.edge.id}`) ??
    (gutters.startX[Math.max(0, Math.min(g, gutters.startX.length - 1))] ?? rightmost) + 28;

  // --- margin sideLoops hug the blocks they actually pass, not the global
  // right edge, and fan outward so parallel loops don't share a lane ---
  const marginLane = new Map<string, number>();
  const marginLoops = plans.filter(
    (p) => p.kind === "sideLoop" && Math.max(p.src.col, p.dst.col) >= cols.length - 1,
  );
  marginLoops.sort((a, b) => Math.abs(a.ty - a.sy) - Math.abs(b.ty - b.sy));
  marginLoops.forEach((plan, i) => {
    const yLo = Math.min(plan.sy, plan.ty);
    const yHi = Math.max(plan.sy, plan.ty);
    const clear = Math.max(
      plan.src.x + plan.src.width,
      plan.dst.x + plan.dst.width,
      ...allBlocks.filter((b) => b.y < yHi && b.y + b.height > yLo).map((b) => b.x + b.width),
    );
    marginLane.set(plan.edge.id, clear + 48 + i * LANE_SPACING);
  });

  // --- same-column row-gap fan (several gapHops through one gap) ---
  const gapGroups = new Map<string, RoutePlan[]>();
  for (const plan of plans) {
    if (plan.kind !== "gapHop") continue;
    const key = `${plan.src.col}:${Math.min(plan.src.row, plan.dst.row)}`;
    (gapGroups.get(key) ?? gapGroups.set(key, []).get(key)!).push(plan);
  }

  // --- emit polylines ---
  for (const plan of plans) {
    const { src, dst, srcBox, dstBox, sy, ty } = plan;
    const pts: { x: number; y: number }[] = [];

    if (plan.kind === "gapHop") {
      const down = dst.row > src.row;
      const group = gapGroups.get(`${src.col}:${Math.min(src.row, dst.row)}`)!;
      const idx = group.indexOf(plan);
      const upper = down ? src : dst;
      const lower = down ? dst : src;
      const midY = (upper.y + upper.height + lower.y) / 2 + (idx - (group.length - 1) / 2) * 22;
      const startY = down ? srcBox.y + srcBox.height : srcBox.y;
      const endY = down ? dstBox.y : dstBox.y + dstBox.height;
      pts.push({ x: sy, y: startY });
      if (Math.abs(sy - ty) < 4) pts.push({ x: sy, y: endY });
      else pts.push({ x: sy, y: midY }, { x: ty, y: midY }, { x: ty, y: endY });
    } else if (plan.kind === "sideLoop") {
      const g = Math.max(src.col, dst.col);
      const lane = marginLane.get(plan.edge.id) ?? laneFor(g, plan);
      pts.push(
        { x: srcBox.x + srcBox.width, y: sy },
        { x: lane, y: sy },
        { x: lane, y: ty },
        { x: dstBox.x + dstBox.width, y: ty },
      );
    } else if (plan.kind === "overdown") {
      const exitY = plan.srcSide === "S" ? srcBox.y + srcBox.height : srcBox.y;
      const entryX = plan.dstSide === "W" ? dstBox.x : dstBox.x + dstBox.width;
      pts.push({ x: sy, y: exitY }, { x: sy, y: ty }, { x: entryX, y: ty });
    } else {
      // lane route through gutters
      const forward = dst.col > src.col;
      const exitX = forward ? srcBox.x + srcBox.width : srcBox.x;
      const lo = Math.min(src.col, dst.col);
      const hi = Math.max(src.col, dst.col);
      const laneA = laneFor(forward ? lo : hi - 1, plan);
      pts.push({ x: exitX, y: sy });
      if (plan.dstSide === "N" || plan.dstSide === "S") {
        const approachY = plan.dstSide === "N" ? dst.y - APPROACH : dst.y + dst.height + APPROACH;
        const entryY = plan.dstSide === "N" ? dstBox.y : dstBox.y + dstBox.height;
        pts.push(
          { x: laneA, y: sy },
          { x: laneA, y: approachY },
          { x: ty, y: approachY },
          { x: ty, y: entryY },
        );
      } else if (hi - lo === 1) {
        const entryX = plan.dstSide === "W" ? dstBox.x : dstBox.x + dstBox.width;
        if (Math.abs(sy - ty) < 4) pts.push({ x: entryX, y: sy });
        else pts.push({ x: laneA, y: sy }, { x: laneA, y: ty }, { x: entryX, y: ty });
      } else {
        // skip columns through a clear corridor above or below the grid
        const laneB = laneFor(forward ? hi - 1 : lo, plan);
        let top = Infinity;
        let bottom = -Infinity;
        for (let c = lo + 1; c < hi; c++) {
          for (const b of cols[c] ?? []) {
            top = Math.min(top, b.y);
            bottom = Math.max(bottom, b.y + b.height);
          }
        }
        const mid = (sy + ty) / 2;
        const corridorY =
          Math.abs(mid - (top - 60)) < Math.abs(mid - (bottom + 60)) ? top - 60 : bottom + 60;
        const entryX = plan.dstSide === "E" ? dstBox.x + dstBox.width : dstBox.x;
        pts.push(
          { x: laneA, y: sy },
          { x: laneA, y: corridorY },
          { x: laneB, y: corridorY },
          { x: laneB, y: ty },
          { x: entryX, y: ty },
        );
      }
    }

    const points = dedupe(pts);
    geo.edgeRoutes[plan.edge.id] = { points, label: labelFor(plan.edge, points, theme) };
  }
}

/**
 * True if the straight stub between the block border and the node on the given
 * side would cross a sibling node inside the same block.
 */
function stubBlocked(
  block: Block,
  geo: LayoutGeometry,
  target: Box,
  side: Side,
  targetId: string,
): boolean {
  const horizontal = side === "W" || side === "E";
  const along = horizontal ? target.y + target.height / 2 : target.x + target.width / 2;
  const from =
    side === "W"
      ? block.x
      : side === "E"
        ? target.x + target.width
        : side === "N"
          ? block.y
          : target.y + target.height;
  const to =
    side === "W"
      ? target.x
      : side === "E"
        ? block.x + block.width
        : side === "N"
          ? target.y
          : block.y + block.height;
  for (const id of block.members) {
    if (id === targetId) continue;
    const b = geo.positions[id];
    if (!b) continue;
    if (horizontal) {
      if (along > b.y && along < b.y + b.height && from < b.x + b.width && to > b.x) return true;
    } else {
      if (along > b.x && along < b.x + b.width && from < b.y + b.height && to > b.y) return true;
    }
  }
  return false;
}

/** Both legs of an overdown route must stay clear of other blocks. */
function overdownClear(src: Block, dst: Block, ty: number, cols: Block[][]): boolean {
  const sx = src.x + src.width / 2;
  const vFrom = Math.min(src.y + src.height, ty);
  const vTo = Math.max(src.y, ty);
  const hFrom = Math.min(sx, dst.x + dst.width / 2);
  const hTo = Math.max(sx, dst.x + dst.width / 2);
  for (const block of cols.flat()) {
    if (block === src || block === dst) continue;
    const bx1 = block.x;
    const bx2 = block.x + block.width;
    const by1 = block.y;
    const by2 = block.y + block.height;
    if (sx > bx1 && sx < bx2 && vFrom < by2 && vTo > by1) return false;
    if (ty > by1 && ty < by2 && hFrom < bx2 && hTo > bx1) return false;
  }
  return true;
}

function dedupe(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 0.5 && Math.abs(prev.y - p.y) < 0.5) continue;
    const prev2 = out[out.length - 2];
    // merge collinear
    if (
      prev &&
      prev2 &&
      ((prev.x === prev2.x && prev.x === p.x) || (prev.y === prev2.y && prev.y === p.y))
    ) {
      out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * Measured label box centered on the route's longest segment. Horizontal
 * segments get a bias — labels read better along them.
 */
function labelFor(
  edge: SanEdge,
  points: { x: number; y: number }[],
  theme: Theme,
): Box | undefined {
  const text = edgeLabelText(edge);
  if (!text || points.length < 2) return undefined;
  let best = 0;
  let bestLen = -1;
  for (let i = 1; i < points.length; i++) {
    const horizontal = Math.abs(points[i]!.y - points[i - 1]!.y) < 0.5;
    const len =
      (Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y)) *
      (horizontal ? 1.8 : 1);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  const width = estimateTextWidth(text, theme.text.edgeLabel.size, theme.fontFamily) + 8;
  const height = estimateTextHeight(theme.text.edgeLabel.size, countTextLines(text)) + 4;
  const mx = (points[best]!.x + points[best - 1]!.x) / 2;
  const my = (points[best]!.y + points[best - 1]!.y) / 2;
  return { x: mx - width / 2, y: my - height / 2, width, height };
}

/**
 * Lower is better. Balances canvas aspect ratio against route quality so the
 * caller can pick between the single-run and two-phase layouts.
 */
export function scoreLayout(geo: LayoutGeometry): number {
  const boxes = [
    ...Object.values(geo.positions),
    ...Object.values(geo.groupBoxes),
    ...Object.values(geo.zoneBoxes),
  ];
  if (boxes.length === 0) return Infinity;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  const aspect = (maxX - minX) / Math.max(maxY - minY, 1);

  let edgeLen = 0;
  let bends = 0;
  const segments: { x1: number; y1: number; x2: number; y2: number; edge: string }[] = [];
  for (const [id, route] of Object.entries(geo.edgeRoutes)) {
    bends += Math.max(route.points.length - 2, 0);
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]!;
      const b = route.points[i]!;
      edgeLen += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, edge: id });
    }
  }
  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i]!;
      const b = segments[j]!;
      if (a.edge === b.edge) continue;
      if (crosses(a, b)) crossings++;
    }
  }
  return Math.abs(Math.log(aspect / 1.8)) * 700 + crossings * 120 + bends * 10 + edgeLen * 0.04;
}

function crosses(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): boolean {
  const aH = a.y1 === a.y2;
  const bH = b.y1 === b.y2;
  if (aH === bH) return false; // parallel orthogonal segments
  const h = aH ? a : b;
  const v = aH ? b : a;
  const [hx1, hx2] = h.x1 < h.x2 ? [h.x1, h.x2] : [h.x2, h.x1];
  const [vy1, vy2] = v.y1 < v.y2 ? [v.y1, v.y2] : [v.y2, v.y1];
  return v.x1 > hx1 + 0.5 && v.x1 < hx2 - 0.5 && h.y1 > vy1 + 0.5 && h.y1 < vy2 - 0.5;
}
