import type { Point } from "./types.js";

/** Binary min-heap of [priority, value]; the A* open set. */
export class Heap {
  private items: [number, number][] = [];
  get size(): number {
    return this.items.length;
  }
  push(priority: number, value: number): void {
    const a = this.items;
    a.push([priority, value]);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p]![0] <= a[i]![0]) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0]![1];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** Drops collinear interior vertices; bends are what remain. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (out.length > 0 && out[out.length - 1]!.x === p.x && out[out.length - 1]!.y === p.y)
      continue;
    if (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop();
    }
    out.push(p);
  }
  return out;
}
