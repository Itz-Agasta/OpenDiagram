import type { Box } from "../geometry.js";
import type { Point, RouterContainer, RouterInput, RouterNode } from "./types.js";

/** Air a route keeps from any node it does not attach to. */
export const CLEARANCE = 14;
/** Grid lines closer than this collapse into one. */
const MERGE = 4;

export interface Grid {
  xs: number[];
  ys: number[];
}

/** Open-interior hit test: touching a border is not a collision. */
export function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  return (
    Math.max(a.x, b.x) > box.x &&
    Math.min(a.x, b.x) < box.x + box.width &&
    Math.max(a.y, b.y) > box.y &&
    Math.min(a.y, b.y) < box.y + box.height
  );
}

export function inflate(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 };
}

export function ancestors(
  id: string | undefined,
  containers: Map<string, RouterContainer>,
): Set<string> {
  const out = new Set<string>();
  for (let c = id; c && !out.has(c); c = containers.get(c)?.parent) out.add(c);
  return out;
}

/**
 * What one edge must steer around. Other nodes keep CLEARANCE; a container the
 * edge neither starts nor ends in is solid, so a route never cuts through an
 * unrelated group; every title band is solid, including the edge's own groups.
 */
export function obstaclesFor(
  from: RouterNode,
  to: RouterNode,
  input: RouterInput,
  containers: Map<string, RouterContainer>,
): Box[] {
  const open = new Set([
    ...ancestors(from.parent, containers),
    ...ancestors(to.parent, containers),
  ]);
  const out: Box[] = [];
  for (const node of input.nodes) {
    if (node.id !== from.id && node.id !== to.id) out.push(inflate(node, CLEARANCE));
    else if (!node.anchor) out.push(node);
    else {
      // Own boxless icon: the icon and the caption under it, not the empty
      // corners beside the icon where the side stubs run.
      const a = node.anchor;
      out.push(a, {
        x: node.x,
        y: a.y + a.height,
        width: node.width,
        height: node.y + node.height - (a.y + a.height),
      });
    }
  }
  for (const c of input.containers) {
    if (!open.has(c.id)) out.push(inflate(c, CLEARANCE / 2));
    else if (c.title) out.push(c.title);
  }
  return out;
}

function merged(values: number[]): number[] {
  const sorted = [...new Set(values.map(Math.round))].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1]! >= MERGE) out.push(v);
  return out;
}

/**
 * Candidate track lines: just outside every box, through node centres, down the
 * middle of every gap between two boxes that face each other (routes there read
 * as deliberate channels, not as lines hugging a border), and any extra port
 * coordinates the caller pins.
 */
export function buildGrid(input: RouterInput, extra: { xs: number[]; ys: number[] }): Grid {
  // Title bands count as boxes: a long title can overhang its container, and
  // without tracks past its end A* finds no way around it.
  const titles = input.containers.flatMap((c) => (c.title ? [c.title] : []));
  const boxes: Box[] = [...input.nodes, ...input.containers, ...titles];
  const xs: number[] = [...extra.xs];
  const ys: number[] = [...extra.ys];
  for (const n of input.nodes) {
    for (const b of n.anchor ? [n, n.anchor] : [n]) {
      xs.push(b.x - CLEARANCE, b.x + b.width + CLEARANCE, b.x + b.width / 2);
      ys.push(b.y - CLEARANCE, b.y + b.height + CLEARANCE, b.y + b.height / 2);
    }
  }
  for (const c of input.containers) {
    xs.push(c.x - CLEARANCE, c.x + c.width + CLEARANCE, c.x + CLEARANCE, c.x + c.width - CLEARANCE);
    ys.push(c.y - CLEARANCE, c.y + c.height + CLEARANCE, c.y + c.height - CLEARANCE);
    if (c.title) {
      ys.push(c.title.y + c.title.height + CLEARANCE / 2);
      xs.push(c.title.x + c.title.width + CLEARANCE);
    }
  }
  // Only boxes that face each other (overlap on the other axis) make a
  // channel worth a midline; every-pair midlines tripled the grid for nothing.
  for (const a of boxes) {
    for (const b of boxes) {
      const gapX = b.x - (a.x + a.width);
      const facingX = a.y < b.y + b.height && b.y < a.y + a.height;
      if (gapX > MERGE * 2 && facingX) xs.push(a.x + a.width + gapX / 2);
      const gapY = b.y - (a.y + a.height);
      const facingY = a.x < b.x + b.width && b.x < a.x + a.width;
      if (gapY > MERGE * 2 && facingY) ys.push(a.y + a.height + gapY / 2);
    }
  }
  const minX = Math.min(...boxes.map((b) => b.x)) - CLEARANCE * 3;
  const maxX = Math.max(...boxes.map((b) => b.x + b.width)) + CLEARANCE * 3;
  const minY = Math.min(...boxes.map((b) => b.y)) - CLEARANCE * 3;
  const maxY = Math.max(...boxes.map((b) => b.y + b.height)) + CLEARANCE * 3;
  xs.push(minX, maxX);
  ys.push(minY, maxY);
  // Port lines must survive merging exactly, or a pinned port has no track.
  const exact = (all: number[], keep: number[]) =>
    [
      ...new Set([
        ...merged(all).filter((v) => keep.every((k) => Math.abs(k - v) >= MERGE)),
        ...keep.map(Math.round),
      ]),
    ].sort((a, b) => a - b);
  return { xs: exact(xs, extra.xs), ys: exact(ys, extra.ys) };
}
