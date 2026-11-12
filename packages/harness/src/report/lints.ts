import type { Box, PositionedSpec } from "../geometry.js";
import { containerTitleBox } from "../measure.js";
import type { Theme } from "../theme/index.js";
import { computeMetrics } from "./metrics.js";

export type LintCode =
  | "GROUP_OVERLAP"
  | "NODE_IN_FOREIGN_GROUP"
  | "NODE_ON_TITLE"
  | "EDGE_HUG"
  | "EDGE_ON_FRAME"
  | "DETOUR"
  | "EMPTY_AREA";

export interface Lint {
  code: LintCode;
  /** Spec ids, node / edge / group, in the order the code names them. */
  subjects: string[];
}

type Point = { x: number; y: number };
type Seg = { a: Point; b: Point; horizontal: boolean };

const hit = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Closer than this, two parallel strokes read as one thick line.
const HUG_GAP = 14;
// Closer than this the strokes coincide: a bundle trunk drawn as one line, fine.
const TRUNK_GAP = 2;
// Shorter shared runs are port fan-outs, not hugging.
const HUG_MIN = 40;
const FRAME_GAP = 6;
const FRAME_MIN = 60;
// Route over 2x the straight Manhattan gap plus slack reads as a detour.
const DETOUR_RATIO = 2;
const DETOUR_SLACK = 160;
// A blank rectangle over this share of the canvas, and this big on both sides,
// reads as a loose layout (Uber: a third of the canvas empty in the middle).
const EMPTY_SHARE = 0.15;
const EMPTY_MIN = 260;
const CELL = 40;
// Grid cells allowed before the scan coarsens: a node dragged far away must not
// turn this into a multi-megabyte allocation.
const MAX_CELLS = 40_000;

function segs(points: Point[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    if (a.x === b.x && a.y === b.y) continue;
    out.push({ a, b, horizontal: Math.abs(a.y - b.y) < Math.abs(a.x - b.x) });
  }
  return out;
}

/** Length two parallel segments run side by side within `gap`, else 0. */
function sideBySide(s: Seg, t: Seg, gap: number): number {
  if (s.horizontal !== t.horizontal) return 0;
  const [along, across] = s.horizontal ? (["x", "y"] as const) : (["y", "x"] as const);
  if (Math.abs(s.a[across] - t.a[across]) > gap) return 0;
  const lo = Math.max(Math.min(s.a[along], s.b[along]), Math.min(t.a[along], t.b[along]));
  const hi = Math.min(Math.max(s.a[along], s.b[along]), Math.max(t.a[along], t.b[along]));
  return Math.max(0, hi - lo);
}

function frameSegs(b: Box): Seg[] {
  const [x2, y2] = [b.x + b.width, b.y + b.height];
  return segs([
    { x: b.x, y: b.y },
    { x: x2, y: b.y },
    { x: x2, y: y2 },
    { x: b.x, y: y2 },
    { x: b.x, y: b.y },
  ]);
}

/**
 * Faults `buildReport` does not score yet: container collisions, nodes on a
 * group's name, and arrow slop (hugging strokes, edges riding a frame, detours).
 * Kept out of the score on purpose: adding them moves every corpus floor in
 * test/, so the layout fixer reads them first and the report adopts them later.
 */
export function layoutLints(p: PositionedSpec, theme: Theme): Lint[] {
  const out: Lint[] = [];
  const groups = Object.entries(p.groupBoxes);
  groups.forEach(([a, boxA], i) => {
    for (const [b, boxB] of groups.slice(i + 1))
      if (hit(boxA, boxB)) out.push({ code: "GROUP_OVERLAP", subjects: [a, b] });
  });
  const groupDefs = new Map((p.groups ?? []).map((g) => [g.id, g]));
  for (const [g, box] of groups) {
    const def = groupDefs.get(g);
    const members = new Set(def?.contains);
    const t = containerTitleBox(def ?? { label: "" }, theme);
    const title = { x: box.x + 8, y: box.y + 6, width: t.width + 16, height: t.height + 12 };
    for (const [n, nodeBox] of Object.entries(p.positions)) {
      if (!members.has(n) && hit(box, nodeBox))
        out.push({ code: "NODE_IN_FOREIGN_GROUP", subjects: [n, g] });
      else if (hit(title, nodeBox)) out.push({ code: "NODE_ON_TITLE", subjects: [n, g] });
    }
  }

  const ends = new Map(p.edges.map((e) => [e.id!, [e.from, e.to]]));
  const routes = Object.entries(p.edgeRoutes).map(([id, r]) => ({ id, segs: segs(r.points), r }));
  routes.forEach((e, i) => {
    for (const f of routes.slice(i + 1)) {
      // Edges sharing a node may run as one trunk (strokes coincide); that is a
      // bundle. Only a run apart-but-close reads as two lines smeared together.
      const [ea, eb] = [ends.get(e.id) ?? [], ends.get(f.id) ?? []];
      const shared = ea.some((n) => eb.includes(n));
      const run = e.segs.reduce(
        (sum, s) =>
          sum +
          f.segs.reduce(
            (m, t) => m + sideBySide(s, t, HUG_GAP) - (shared ? sideBySide(s, t, TRUNK_GAP) : 0),
            0,
          ),
        0,
      );
      if (run >= HUG_MIN) out.push({ code: "EDGE_HUG", subjects: [e.id, f.id] });
    }
    for (const [g, box] of groups) {
      const frame = frameSegs(box);
      const run = e.segs.reduce(
        (sum, s) => sum + frame.reduce((m, t) => m + sideBySide(s, t, FRAME_GAP), 0),
        0,
      );
      if (run >= FRAME_MIN) out.push({ code: "EDGE_ON_FRAME", subjects: [e.id, g] });
    }
    const pts = e.r.points;
    if (pts.length > 1) {
      const [a, b] = [pts[0]!, pts[pts.length - 1]!];
      const length = e.segs.reduce(
        (sum, s) => sum + Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y),
        0,
      );
      const direct = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (length > DETOUR_RATIO * direct + DETOUR_SLACK)
        out.push({ code: "DETOUR", subjects: [e.id] });
    }
  });
  const empty = emptyArea(p);
  if (empty) out.push({ code: "EMPTY_AREA", subjects: [empty] });
  return out;
}

/**
 * The largest blank rectangle inside the drawing's bounds, as "x,y WxH", or
 * undefined when none is big enough to matter. Boxes, frames and label chips
 * count as ink; arrows do not (a long arrow across a void is still a void).
 */
function emptyArea(p: PositionedSpec): string | undefined {
  const ink = [
    ...Object.values(p.positions),
    ...Object.values(p.groupBoxes),
    ...Object.values(p.zoneBoxes),
    ...Object.values(p.edgeRoutes).flatMap((r) => (r.label ? [r.label] : [])),
  ];
  if (ink.length < 4) return undefined;
  const x0 = Math.min(...ink.map((b) => b.x));
  const y0 = Math.min(...ink.map((b) => b.y));
  const spanX = Math.max(...ink.map((b) => b.x + b.width)) - x0;
  const spanY = Math.max(...ink.map((b) => b.y + b.height)) - y0;
  const cell = Math.max(CELL, Math.sqrt((spanX * spanY) / MAX_CELLS));
  const cols = Math.ceil(spanX / cell);
  const rows = Math.ceil(spanY / cell);
  const full = Array.from({ length: rows }, () => new Uint8Array(cols));
  for (const b of ink)
    for (let r = Math.floor((b.y - y0) / cell); r < Math.ceil((b.y + b.height - y0) / cell); r++)
      for (let c = Math.floor((b.x - x0) / cell); c < Math.ceil((b.x + b.width - x0) / cell); c++)
        if (full[r]) full[r]![c] = 1;
  // Largest all-zero rectangle: per row, a histogram of blank run heights.
  const heights = Array.from({ length: cols }, () => 0);
  let best = { area: 0, r: 0, c: 0, w: 0, h: 0 };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights[c] = full[r]![c] ? 0 : heights[c]! + 1;
    const stack: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const h = c === cols ? 0 : heights[c]!;
      while (stack.length && heights[stack[stack.length - 1]!]! >= h) {
        const top = stack.pop()!;
        const left = stack.length ? stack[stack.length - 1]! + 1 : 0;
        const area = heights[top]! * (c - left);
        // Largest rectangle that is big enough both ways: a thin strip can out-area
        // a square void and must not hide it.
        const fits = (c - left) * cell >= EMPTY_MIN && heights[top]! * cell >= EMPTY_MIN;
        if (fits && area > best.area) best = { area, r, c: left, w: c - left, h: heights[top]! };
      }
      stack.push(c);
    }
  }
  const [w, h] = [Math.round(best.w * cell), Math.round(best.h * cell)];
  if (best.area === 0 || best.area < EMPTY_SHARE * rows * cols) return undefined;
  const x = x0 + best.c * cell;
  const y = y0 + (best.r - best.h + 1) * cell;
  return `${Math.round(x)},${Math.round(y)} ${w}x${h}`;
}

const HARD: LintCode[] = ["GROUP_OVERLAP", "NODE_IN_FOREIGN_GROUP", "NODE_ON_TITLE"];

/**
 * Faults that read as broken whatever anyone's taste: boxes colliding, an edge
 * through a box, a dropped edge, a label printed over a box or another label,
 * a node in the wrong frame or on a group's name.
 * The fixer's judge reverts only a step that raises this count.
 */
export function hardFaults(p: PositionedSpec, theme: Theme, lints = layoutLints(p, theme)): number {
  const m = computeMetrics(p);
  return (
    m.nodeOverlaps +
    m.edgeThroughNode +
    m.unrouted +
    m.labelCollisions +
    lints.filter((l) => HARD.includes(l.code)).length
  );
}
