import type { Box } from "../geometry.js";
import type { DiagramEdge } from "../schema.js";
import type { LayoutGeometry } from "./macro.js";
import type { Sanitized } from "./sanitize.js";

// Air kept between a moved node and anything it did not touch before.
const GAP = 24;
// Inside a container, nodes stay below the title row and off the border.
const PAD_TOP = 48;
const PAD = 8;

/**
 * Removes the stair-step ELK leaves inside containers: nodes chained by edges
 * in one container, overlapping on the cross axis, form a band; the band snaps
 * onto the single centre line that the most members can reach without hitting
 * anything. One member per flow slot, so fanned-out siblings keep their stack.
 * Only legal because edges are routed after this runs.
 */
export function straightenRows(
  geo: LayoutGeometry,
  s: Sanitized,
  edges: DiagramEdge[],
  horizontal: boolean,
): void {
  const pos = geo.positions;
  const ids = Object.keys(pos);
  const lo = (b: Box) => (horizontal ? b.y : b.x);
  const len = (b: Box) => (horizontal ? b.height : b.width);
  const mid = (b: Box) => lo(b) + len(b) / 2;
  const span = (b: Box): [number, number] =>
    horizontal ? [b.x, b.x + b.width] : [b.y, b.y + b.height];
  const at = (b: Box, c: number): Box =>
    horizontal
      ? { ...b, y: Math.round(c - b.height / 2) }
      : { ...b, x: Math.round(c - b.width / 2) };
  const boxOf = (id?: string) => (id ? (geo.groupBoxes[id] ?? geo.zoneBoxes[id]) : undefined);

  const root = new Map(ids.map((i) => [i, i]));
  const find = (i: string): string => {
    while (root.get(i) !== i) i = root.get(i)!;
    return i;
  };
  const linked = new Set<string>();
  for (const e of edges) {
    const a = pos[e.from];
    const b = pos[e.to];
    if (!a || !b || e.from === e.to || s.nodeParent.get(e.from) !== s.nodeParent.get(e.to))
      continue;
    if (Math.min(lo(a) + len(a), lo(b) + len(b)) <= Math.max(lo(a), lo(b))) continue;
    root.set(find(e.from), find(e.to));
    linked.add(e.from).add(e.to);
  }
  const bands = new Map<string, string[]>();
  for (const i of linked) bands.set(find(i), [...(bands.get(find(i)) ?? []), i]);

  const clear = (a: Box, b: Box, gap: number) =>
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y;
  // A node sitting directly in a zone must not slide into a sibling group.
  const zoneOf = new Map<string, string>();
  for (const z of s.zones) for (const g of z.contains) zoneOf.set(g, z.id);
  const foreign = (id: string) => {
    const own = new Set<string | undefined>([
      s.nodeParent.get(id),
      zoneOf.get(s.nodeParent.get(id) ?? ""),
    ]);
    return Object.entries(geo.groupBoxes)
      .filter(([g]) => !own.has(g))
      .map(([, box]) => box);
  };
  const fits = (id: string, b: Box, band: string[]) => {
    if (foreign(id).some((g) => !clear(b, g, 0))) return false;
    const c = boxOf(s.nodeParent.get(id));
    if (
      c &&
      (b.y < c.y + PAD_TOP ||
        b.y + b.height > c.y + c.height - PAD ||
        b.x < c.x + PAD ||
        b.x + b.width > c.x + c.width - PAD)
    )
      return false;
    return ids.every((o) => o === id || band.includes(o) || clear(b, pos[o]!, GAP));
  };
  const chain = (members: string[], line: number) => {
    const picked: string[] = [];
    for (const m of [...members].sort(
      (a, b) => Math.abs(mid(pos[a]!) - line) - Math.abs(mid(pos[b]!) - line),
    )) {
      const [s0, s1] = span(pos[m]!);
      if (picked.every((q) => span(pos[q]!)[1] <= s0 || s1 <= span(pos[q]!)[0])) picked.push(m);
    }
    return picked;
  };
  // Moves what fits onto `line`; returns how many moved, or -1 on a self-collision.
  const apply = (members: string[], line: number, commit: boolean) => {
    const c = chain(members, line);
    const saved = new Map(c.map((m) => [m, pos[m]!]));
    let moved = 0;
    for (const m of c) {
      const cand = at(pos[m]!, line);
      if (fits(m, cand, c)) {
        pos[m] = cand;
        moved++;
      }
    }
    const clash = c.some((a, i) => c.slice(i + 1).some((b) => !clear(pos[a]!, pos[b]!, 0)));
    if (!commit || clash) for (const [m, b] of saved) pos[m] = b;
    return clash ? -1 : moved;
  };
  for (const members of bands.values()) {
    if (members.length < 2) continue;
    let best: [number, number] | undefined;
    for (const m of members) {
      const n = apply(members, mid(pos[m]!), false);
      if (!best || n > best[0]) best = [n, mid(pos[m]!)];
    }
    if (best && best[0] > 0) apply(members, best[1], true);
  }
}
