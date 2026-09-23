import type { Box } from "../geometry.js";
import { segmentHitsBox } from "./grid.js";
import type { Point } from "./types.js";

interface Run {
  edge: string;
  /** Index of the segment's first point in its route. */
  i: number;
  horizontal: boolean;
  coord: number;
  lo: number;
  hi: number;
}

/** Can run `r` move to `to` without flipping a neighbour or hitting anything? */
function fits(r: Run, to: number, pts: Point[], solid: Box[], axis: "x" | "y"): boolean {
  const a = { ...pts[r.i]!, [axis]: to };
  const b = { ...pts[r.i + 1]!, [axis]: to };
  const before = pts[r.i - 1]!;
  const after = pts[r.i + 2]!;
  // The neighbours run along `axis`; they must keep their direction and some length.
  const keeps = (from: Point, old: Point, now: Point) =>
    Math.sign(old[axis] - from[axis]) === Math.sign(now[axis] - from[axis]) &&
    Math.abs(now[axis] - from[axis]) >= 6;
  if (!keeps(before, pts[r.i]!, a) || !keeps(after, pts[r.i + 1]!, b)) return false;
  return solid.every(
    (o) =>
      !segmentHitsBox(a, b, o) && !segmentHitsBox(before, a, o) && !segmentHitsBox(b, after, o),
  );
}

/**
 * Every branch of a bundle leaves the trunk on one shared bus: the first bend
 * after a shared port (or the last before one) moves onto the coordinate most
 * branches already use, when it can without hitting anything.
 */
export function alignBundles(
  routes: Map<string, Point[]>,
  solid: Box[],
  bundles: Map<string, string[]>,
  sources: Map<string, string>,
): void {
  const members = new Map<string, string[]>();
  for (const [edge, keys] of bundles)
    for (const k of keys) members.set(k, [...(members.get(k) ?? []), edge]);
  for (const [key, edges] of members) {
    const node = key.slice(0, key.lastIndexOf(":"));
    const runs: Run[] = [];
    for (const edge of edges) {
      const pts = routes.get(edge);
      if (!pts || pts.length < 4) continue;
      // The bus is segment 1 from a shared source, segment n-3 into a shared target.
      const i = sources.get(edge) === node ? 1 : pts.length - 3;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const horizontal = a.y === b.y;
      runs.push({ edge, i, horizontal, coord: horizontal ? a.y : a.x, lo: 0, hi: 0 });
    }
    if (runs.length < 2 || runs.some((r) => r.horizontal !== runs[0]!.horizontal)) continue;
    const counts = new Map<number, number>();
    for (const r of runs) counts.set(r.coord, (counts.get(r.coord) ?? 0) + 1);
    const target = [...counts].sort((x, y) => y[1] - x[1])[0]![0];
    const axis = runs[0]!.horizontal ? "y" : "x";
    const mates = new Set(edges);
    for (const r of runs) {
      const pts = routes.get(r.edge)!;
      if (r.coord === target || !fits(r, target, pts, solid, axis)) continue;
      if (landsOnOther(pts[r.i]!, pts[r.i + 1]!, axis, target, routes, mates)) continue;
      pts[r.i] = { ...pts[r.i]!, [axis]: target };
      pts[r.i + 1] = { ...pts[r.i + 1]!, [axis]: target };
    }
  }
}

/** Would the run, moved to `to`, lie on top of a route outside its bundle? */
function landsOnOther(
  a: Point,
  b: Point,
  axis: "x" | "y",
  to: number,
  routes: Map<string, Point[]>,
  mates: Set<string>,
): boolean {
  const run = axis === "y" ? "x" : "y";
  const [lo, hi] = [Math.min(a[run], b[run]), Math.max(a[run], b[run])];
  for (const [edge, pts] of routes) {
    if (mates.has(edge)) continue;
    for (let k = 0; k < pts.length - 1; k++) {
      const [p, q] = [pts[k]!, pts[k + 1]!];
      if (p[axis] !== to || q[axis] !== to) continue;
      if (Math.min(hi, Math.max(p[run], q[run])) - Math.max(lo, Math.min(p[run], q[run])) > 0)
        return true;
    }
  }
  return false;
}
