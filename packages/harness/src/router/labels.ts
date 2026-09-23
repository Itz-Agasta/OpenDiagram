import type { Box } from "../geometry.js";
import type { Point } from "./types.js";

// Room kept clear at the arrowhead end and at the tail of a route.
const HEAD_ROOM = 18;
const TAIL_ROOM = 10;
const STEP = 6;
// Masking another edge hides it; that is almost as bad as a collision.
const COVER = 300;
// A chip set beside its line, not on it: the gap, and its price.
const SIDE_GAP = 4;
const SIDE = 40;

const hit = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.width + pad &&
  b.x < a.x + a.width + pad &&
  a.y < b.y + b.height + pad &&
  b.y < a.y + a.height + pad;

/** Does the chip straddle a container border (half inside, half out)? */
const straddles = (l: Box, c: Box) =>
  hit(l, c) &&
  !(l.x >= c.x && l.y >= c.y && l.x + l.width <= c.x + c.width && l.y + l.height <= c.y + c.height);

function segmentsCover(box: Box, route: Point[]): boolean {
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const seg = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
    if (hit(box, seg)) return true;
  }
  return false;
}

/**
 * Inline label chips, centred on a straight run of their own route. Candidates
 * slide along every run; nodes, title bands, container borders and other chips
 * are hard limits; covering another route is priced, not forbidden, because a
 * dense diagram sometimes has no clean spot. Tightest edges choose first.
 */
export function placeLabels(
  routes: Map<string, Point[]>,
  sizes: Map<string, { width: number; height: number }>,
  nodes: Box[],
  titles: Box[],
  containers: Box[],
): Map<string, Box> {
  const placed = new Map<string, Box>();
  const options = new Map<string, { box: Box; cost: number }[]>();
  for (const [edge, size] of sizes) {
    const route = routes.get(edge);
    if (route) options.set(edge, candidates(route, size));
  }
  const order = [...options.keys()].sort((a, b) => options.get(a)!.length - options.get(b)!.length);
  for (const edge of order) {
    let best: { box: Box; cost: number } | undefined;
    for (const c of options.get(edge)!) {
      if (nodes.some((n) => hit(c.box, n, 2)) || titles.some((t) => hit(c.box, t, 2))) continue;
      if (containers.some((k) => straddles(c.box, k))) continue;
      if ([...placed.values()].some((p) => hit(c.box, p, 4))) continue;
      let cost = c.cost;
      for (const [other, pts] of routes)
        if (other !== edge && segmentsCover(c.box, pts)) cost += COVER;
      if (!best || cost < best.cost) best = { box: c.box, cost };
    }
    // FIXME: a chip with no legal spot falls back to the longest run's middle and may collide;
    // counted by the report as LABEL_COLLISION.
    best ??= options.get(edge)![0] ?? {
      box: longestMiddle(routes.get(edge)!, sizes.get(edge)!),
      cost: 0,
    };
    placed.set(edge, best.box);
  }
  return placed;
}

/** Chip centred on the longest run: the fallback when no run is long enough to slide along. */
function longestMiddle(route: Point[], size: { width: number; height: number }): Box {
  let best = { cx: route[0]!.x, cy: route[0]!.y, len: -1 };
  for (let i = 0; i < route.length - 1; i++) {
    const [a, b] = [route[i]!, route[i + 1]!];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (len > best.len) best = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, len };
  }
  const x = Math.round(best.cx - size.width / 2);
  return { x, y: Math.round(best.cy - size.height / 2), width: size.width, height: size.height };
}

function candidates(
  route: Point[],
  size: { width: number; height: number },
): { box: Box; cost: number }[] {
  const total = route
    .slice(1)
    .reduce((s, p, i) => s + Math.abs(p.x - route[i]!.x) + Math.abs(p.y - route[i]!.y), 0);
  const out: { box: Box; cost: number }[] = [];
  let walked = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const horizontal = a.y === b.y;
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const need = horizontal ? size.width : size.height;
    const head = i === route.length - 2 ? HEAD_ROOM : 4;
    const tail = i === 0 ? TAIL_ROOM : 4;
    const sign = horizontal ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y);
    for (let t = tail + need / 2; t <= len - head - need / 2; t += STEP) {
      const cx = horizontal ? a.x + sign * t : a.x;
      const cy = horizontal ? a.y : a.y + sign * t;
      const box = {
        x: Math.round(cx - size.width / 2),
        y: Math.round(cy - size.height / 2),
        width: size.width,
        height: size.height,
      };
      // Near the middle of the whole route reads as "this label names this edge".
      const fromMiddle = Math.abs(walked + t - total / 2);
      const base = fromMiddle * 0.25 + (horizontal ? 0 : 25) - Math.min(len, 300) * 0.05;
      out.push({ box, cost: base });
      // Beside the line instead of on it: the only option in a corridor
      // narrower than the chip, e.g. a route squeezed between a node and a
      // group border. Priced so an on-line spot always wins when one exists.
      for (const side of [-1, 1]) {
        const off = horizontal
          ? { ...box, y: Math.round(cy + side * (size.height / 2 + SIDE_GAP) - size.height / 2) }
          : { ...box, x: Math.round(cx + side * (size.width / 2 + SIDE_GAP) - size.width / 2) };
        out.push({ box: off, cost: base + SIDE });
      }
    }
    walked += len;
  }
  return out.sort((x, y) => x.cost - y.cost);
}
