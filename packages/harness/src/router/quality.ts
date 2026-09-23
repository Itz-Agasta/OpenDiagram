import type { Point } from "./types.js";

const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
// Segments whose ends are this close meet rather than cross; the report's own tolerance.
const meets = (a: Point, b: Point) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

/**
 * Crossings between two orthogonal polylines, counted the way the report
 * counts them (report/metrics.ts): a T-touch counts, since it reads as a
 * connection that is not there, unless the two routes share their first or
 * last point (a real trunk splitting). Segments meeting end to end do not.
 */
export function crossings(p: Point[], q: Point[]): number {
  const trunk = same(p[0]!, q[0]!) || same(p[p.length - 1]!, q[q.length - 1]!);
  let n = 0;
  for (let i = 0; i < p.length - 1; i++) {
    for (let j = 0; j < q.length - 1; j++) {
      const [a, b, c, d] = [p[i]!, p[i + 1]!, q[j]!, q[j + 1]!];
      const ph = a.y === b.y;
      if (ph === (c.y === d.y)) continue;
      if ([a, b].some((u) => meets(u, c) || meets(u, d))) continue;
      const [h0, h1, v0, v1] = ph ? [a, b, c, d] : [c, d, a, b];
      const x = v0.x;
      const y = h0.y;
      const [x0, x1] = [Math.min(h0.x, h1.x), Math.max(h0.x, h1.x)];
      const [y0, y1] = [Math.min(v0.y, v1.y), Math.max(v0.y, v1.y)];
      const strict = x > x0 && x < x1 && y > y0 && y < y1;
      const touch = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (trunk ? strict : touch) n++;
    }
  }
  return n;
}

/**
 * One number to compare whole routings: a crossing outweighs any bend count we
 * see in practice, a bend outweighs 100px of extra length.
 */
export function routingCost(routes: Map<string, Point[]>): number {
  const all = [...routes.values()];
  let cross = 0;
  let bends = 0;
  let length = 0;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) cross += crossings(all[i]!, all[j]!);
    bends += turns(all[i]!);
    for (let k = 0; k < all[i]!.length - 1; k++)
      length +=
        Math.abs(all[i]![k + 1]!.x - all[i]![k]!.x) + Math.abs(all[i]![k + 1]!.y - all[i]![k]!.y);
  }
  return cross * 1000 + bends * 100 + length;
}

/** Direction changes only; collinear or repeated vertices (fallback elbows) are not bends. */
function turns(pts: Point[]): number {
  let n = 0;
  let last: boolean | undefined;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k]!;
    const b = pts[k + 1]!;
    if (a.x === b.x && a.y === b.y) continue;
    const vertical = a.x === b.x;
    if (last !== undefined && vertical !== last) n++;
    last = vertical;
  }
  return n;
}
