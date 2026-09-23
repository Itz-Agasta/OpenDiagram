import type { Box } from "../geometry.js";
import { CLEARANCE, type Grid, segmentHitsBox } from "./grid.js";
import { Heap, simplify } from "./heap.js";
import { type Face, NORMAL, type Point } from "./types.js";

// Cost units are pixels of travel. A bend is worth 36px of detour and a
// crossing 60px. A pixel run on top of another route costs 0.5: cheap, since
// a detour around a node reads worse than two close lines. Measured: 1 gains
// +17 on classic but exposes a port-nesting crossing on sketch (payment corpus
// spec), so it waits for that fix. A post-pass pulling shared runs apart fixed
// 1 of 15 and was deleted.
const BEND = 36;
const CROSS = 60;
const OVERLAP = 0.5;
// Bundle-mates share a trunk on purpose, but it should split early: the split
// is where each branch gets a run long enough for its own label.
const TRUNK = 0.2;
// A run within WALL px of a container border, parallel to it, reads as part of
// the border. Priced per pixel like a mild overlap.
const WALL = 10;
const HUG = 1;

/** Already-committed route segment, used to price congestion. */
export interface Occupied {
  a: Point;
  b: Point;
  edge: string;
  /** Bundles (shared port + trunk) the edge belongs to; bundle-mates share track for free. */
  bundles?: string[];
}

/** One end of a search: a port on a face, and the extra price of using it. */
export interface Terminal {
  port: Point;
  face: Face;
  box: Box;
  cost: number;
}

const DIRS: Point[] = [NORMAL.top, NORMAL.right, NORMAL.bottom, NORMAL.left];
const dirIndex = (d: Point) => DIRS.findIndex((v) => v.x === d.x && v.y === d.y);

/** Grid line just past the face, where the stub out of a port lands. */
function stubIndex(t: Terminal, grid: Grid): [number, number] | undefined {
  const { port, face, box } = t;
  const xi = grid.xs.indexOf(Math.round(port.x));
  const yi = grid.ys.indexOf(Math.round(port.y));
  const past = (lines: number[], edge: number, sign: number) => {
    if (sign > 0) return lines.findIndex((v) => v >= edge + CLEARANCE / 2);
    for (let k = lines.length - 1; k >= 0; k--) if (lines[k]! <= edge - CLEARANCE / 2) return k;
    return -1;
  };
  let at: [number, number];
  if (face === "right") at = [past(grid.xs, box.x + box.width, 1), yi];
  else if (face === "left") at = [past(grid.xs, box.x, -1), yi];
  else if (face === "bottom") at = [xi, past(grid.ys, box.y + box.height, 1)];
  else at = [xi, past(grid.ys, box.y, -1)];
  return at[0] < 0 || at[1] < 0 ? undefined : at;
}

function hugging(a: Point, b: Point, walls: Box[]): number {
  let cost = 0;
  const horizontal = a.y === b.y;
  for (const w of walls) {
    const [lo, hi] = horizontal
      ? [Math.max(Math.min(a.x, b.x), w.x), Math.min(Math.max(a.x, b.x), w.x + w.width)]
      : [Math.max(Math.min(a.y, b.y), w.y), Math.min(Math.max(a.y, b.y), w.y + w.height)];
    if (hi <= lo) continue;
    const c = horizontal ? a.y : a.x;
    const edges = horizontal ? [w.y, w.y + w.height] : [w.x, w.x + w.width];
    if (edges.some((e) => Math.abs(c - e) < WALL)) cost += (hi - lo) * HUG;
  }
  return cost;
}

function penalty(a: Point, b: Point, occupied: Occupied[], bundles: string[]): number {
  let cost = 0;
  const horizontal = a.y === b.y;
  for (const o of occupied) {
    const mate = o.bundles?.some((k) => bundles.includes(k)) ?? false;
    const oh = o.a.y === o.b.y;
    if (horizontal === oh) {
      const same = horizontal ? Math.abs(o.a.y - a.y) < 1 : Math.abs(o.a.x - a.x) < 1;
      if (!same) continue;
      const [s0, s1] = horizontal
        ? [Math.min(a.x, b.x), Math.max(a.x, b.x)]
        : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
      const [t0, t1] = horizontal
        ? [Math.min(o.a.x, o.b.x), Math.max(o.a.x, o.b.x)]
        : [Math.min(o.a.y, o.b.y), Math.max(o.a.y, o.b.y)];
      cost += Math.max(0, Math.min(s1, t1) - Math.max(s0, t0)) * (mate ? TRUNK : OVERLAP);
    } else if (!mate) {
      const [h, v] = horizontal
        ? [
            [a, b],
            [o.a, o.b],
          ]
        : [
            [o.a, o.b],
            [a, b],
          ];
      const y = h[0]!.y;
      const x = v[0]!.x;
      if (
        x > Math.min(h[0]!.x, h[1]!.x) &&
        x < Math.max(h[0]!.x, h[1]!.x) &&
        y > Math.min(v[0]!.y, v[1]!.y) &&
        y < Math.max(v[0]!.y, v[1]!.y)
      )
        cost += CROSS;
    }
  }
  return cost;
}

/**
 * A* over the track grid from any source terminal to any target terminal.
 * State is (grid point, heading), so bends are priced exactly. Returns the full
 * polyline port to port, or undefined when every path is blocked.
 */
export function search(
  grid: Grid,
  sources: Terminal[],
  targets: Terminal[],
  obstacles: Box[],
  occupied: Occupied[],
  bundles: string[] = [],
  walls: Box[] = [],
): { points: Point[]; source: Terminal; target: Terminal } | undefined {
  const free = (a: Point, b: Point) => obstacles.every((o) => !segmentHitsBox(a, b, o));
  // The shortcut skips A*, so it must also skip everything A* would price:
  // a straight run on another route or along a border goes through search.
  const direct = straightRun(
    sources,
    targets,
    (a, b) => free(a, b) && penalty(a, b, occupied, bundles) === 0 && hugging(a, b, walls) === 0,
  );
  if (direct) return direct;
  const nx = grid.xs.length;
  const ny = grid.ys.length;

  const key = (xi: number, yi: number, d: number) => (xi * ny + yi) * 4 + d;
  // Sparse: a search touches a few hundred of the grid's ~100k states, and
  // allocating dense arrays per call cost more than the search itself.
  const cost = new Map<number, number>();
  const prev = new Map<number, number>();
  const g = (k: number) => cost.get(k) ?? Infinity;
  const origin = new Map<number, Terminal>();
  const goals = new Map<number, Terminal[]>();
  const pt = (xi: number, yi: number): Point => ({ x: grid.xs[xi]!, y: grid.ys[yi]! });

  for (const t of targets) {
    const at = stubIndex(t, grid);
    if (at) goals.set(at[0] * ny + at[1], [...(goals.get(at[0] * ny + at[1]) ?? []), t]);
  }
  // Manhattan distance, plus one bend when the target is on neither axis:
  // still a lower bound, and it cuts expansions sharply on open canvases.
  const h = (p: Point) => {
    let best = Infinity;
    for (const t of targets) {
      const dx = Math.abs(t.port.x - p.x);
      const dy = Math.abs(t.port.y - p.y);
      const v = dx + dy + (dx > 0.5 && dy > 0.5 ? BEND : 0);
      if (v < best) best = v;
    }
    return best;
  };
  const heap = new Heap();
  for (const s of sources) {
    const at = stubIndex(s, grid);
    if (!at) continue;
    const k = key(at[0], at[1], dirIndex(NORMAL[s.face]));
    const p = pt(at[0], at[1]);
    // The stub from port to grid is drawn too; a neighbour or title closer
    // than the stub line would otherwise be cut through.
    if (!free(s.port, p)) continue;
    const c = s.cost + Math.abs(p.x - s.port.x) + Math.abs(p.y - s.port.y);
    if (c < g(k)) {
      cost.set(k, c);
      origin.set(k, s);
      heap.push(c + h(p), k);
    }
  }

  let best: { cost: number; k: number; target: Terminal } | undefined;
  while (heap.size > 0) {
    const k = heap.pop();
    const d = k % 4;
    const cell = (k - d) / 4;
    const xi = Math.floor(cell / ny);
    const yi = cell % ny;
    const here = pt(xi, yi);
    if (best && g(k) + h(here) >= best.cost) break;
    for (const t of goals.get(cell) ?? []) {
      const inward = dirIndex({ x: -NORMAL[t.face].x, y: -NORMAL[t.face].y });
      if ((d + 2) % 4 === inward) continue; // would U-turn into the node
      if (!free(here, t.port)) continue;
      const total =
        g(k) +
        t.cost +
        (d === inward ? 0 : BEND) +
        Math.abs(here.x - t.port.x) +
        Math.abs(here.y - t.port.y);
      if (!best || total < best.cost) best = { cost: total, k, target: t };
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue;
      const step = DIRS[nd]!;
      const xj = xi + step.x;
      const yj = yi + step.y;
      if (xj < 0 || yj < 0 || xj >= nx || yj >= ny) continue;
      const there = pt(xj, yj);
      if (!free(here, there)) continue;
      const c =
        g(k) +
        Math.abs(there.x - here.x) +
        Math.abs(there.y - here.y) +
        (nd === d ? 0 : BEND) +
        penalty(here, there, occupied, bundles) +
        hugging(here, there, walls);
      const kj = key(xj, yj, nd);
      if (c < g(kj)) {
        cost.set(kj, c);
        prev.set(kj, k);
        heap.push(c + h(there), kj);
      }
    }
  }
  if (!best) return undefined;

  const cells: Point[] = [];
  let k = best.k;
  let start = k;
  for (; k >= 0; k = prev.get(k) ?? -1) {
    const c = ((k - (k % 4)) / 4) | 0;
    cells.unshift(pt(Math.floor(c / ny), c % ny));
    start = k;
  }
  const source = origin.get(start)!;
  return {
    points: simplify([source.port, ...cells, best.target.port]),
    source,
    target: best.target,
  };
}

/**
 * Ports that already face each other on one line need no search: the straight
 * run is optimal, and it survives gaps too tight for the grid's stub lines.
 */
function straightRun(
  sources: Terminal[],
  targets: Terminal[],
  clear: (a: Point, b: Point) => boolean,
): { points: Point[]; source: Terminal; target: Terminal } | undefined {
  let best: { points: Point[]; source: Terminal; target: Terminal; cost: number } | undefined;
  for (const s of sources) {
    for (const t of targets) {
      const n = NORMAL[s.face];
      if (NORMAL[t.face].x !== -n.x || NORMAL[t.face].y !== -n.y) continue;
      const dx = t.port.x - s.port.x;
      const dy = t.port.y - s.port.y;
      const aligned =
        n.x !== 0 ? Math.abs(dy) < 0.5 && dx * n.x > 0 : Math.abs(dx) < 0.5 && dy * n.y > 0;
      if (!aligned || !clear(s.port, t.port)) continue;
      const cost = s.cost + t.cost + Math.abs(dx) + Math.abs(dy);
      if (!best || cost < best.cost)
        best = { points: [s.port, t.port], source: s, target: t, cost };
    }
  }
  return best;
}
