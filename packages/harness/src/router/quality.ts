import type { Point } from "./types.js";

/** Proper crossings between two orthogonal polylines (shared endpoints and overlaps excluded). */
export function crossings(p: Point[], q: Point[]): number {
  let n = 0;
  for (let i = 0; i < p.length - 1; i++) {
    for (let j = 0; j < q.length - 1; j++) {
      const [a, b, c, d] = [p[i]!, p[i + 1]!, q[j]!, q[j + 1]!];
      const ph = a.y === b.y;
      if (ph === (c.y === d.y)) continue;
      const [h0, h1, v0, v1] = ph ? [a, b, c, d] : [c, d, a, b];
      const x = v0.x;
      const y = h0.y;
      if (
        x > Math.min(h0.x, h1.x) &&
        x < Math.max(h0.x, h1.x) &&
        y > Math.min(v0.y, v1.y) &&
        y < Math.max(v0.y, v1.y)
      )
        n++;
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
