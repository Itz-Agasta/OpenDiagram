import type { Box } from "../geometry.js";
import { FACES, type Face, NORMAL, type Point, type RouterInput } from "./types.js";

// Min distance between two ports sharing a face, and how far the outermost
// port stays from a corner (the rounded corner and the arrowhead need it).
const SLOT_GAP = 16;
const INSET = 12;

/** Slot key for one end of an edge. NUL-joined: ids are free text and may hold ":". */
export const endKey = (edge: string, node: string) => `${edge}\u0000${node}`;

const center = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const along = (face: Face) => (face === "left" || face === "right" ? "y" : "x");

export function portPoint(box: Box, face: Face, at: number): Point {
  if (face === "left") return { x: box.x, y: at };
  if (face === "right") return { x: box.x + box.width, y: at };
  if (face === "top") return { x: at, y: box.y };
  return { x: at, y: box.y + box.height };
}

/**
 * Price of leaving `box` through `face` toward `other`. Facing the other end is
 * free; facing away costs up to 160px of detour. Flow direction adds a nudge so
 * an LR diagram leaves right and enters left when geometry is a toss-up.
 */
export function faceCosts(
  box: Box,
  other: Box,
  role: "source" | "target",
  dir: RouterInput["direction"],
): Record<Face, number> {
  const a = center(box);
  const b = center(other);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const flow: Record<RouterInput["direction"], Face> = {
    LR: "right",
    RL: "left",
    TB: "bottom",
    BT: "top",
  };
  const opposite: Record<Face, Face> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  const preferred = role === "source" ? flow[dir] : opposite[flow[dir]];
  const out = {} as Record<Face, number>;
  for (const f of FACES) {
    const cos = (NORMAL[f].x * (b.x - a.x) + NORMAL[f].y * (b.y - a.y)) / len;
    out[f] = (1 - cos) * 80 + (f === preferred ? 0 : 20);
  }
  return out;
}

export interface Endpoint {
  edge: string;
  node: string;
  face: Face;
  /** Coordinate (along the face) of the far end, used to order ports without crossings. */
  toward: number;
  /** Height of the edge's label chip; neighbouring ports keep it apart so chips can stack. */
  chip?: number;
  /** Preferred coordinate along the face; the face centre when absent. */
  want?: number;
}

/**
 * Places every face's ports in the order `toward` gives (so edges leaving one
 * face never cross on the way out), each as close to its `want` as the order
 * and the minimum gap allow. That is isotonic regression on `want - i * gap`,
 * solved by pool-adjacent-violators, then clamped onto the face.
 */
export function assignSlots(
  endpoints: Endpoint[],
  boxOf: (node: string, face: Face) => Box,
): { slots: Map<string, number>; bundles: Map<string, string> } {
  const byFace = new Map<string, Endpoint[]>();
  for (const e of endpoints)
    byFace.set(`${e.node}\u0000${e.face}`, [...(byFace.get(`${e.node}\u0000${e.face}`) ?? []), e]);
  const out = new Map<string, number>();
  const bundles = new Map<string, string>();
  for (const [key, group] of byFace) {
    const { node, face } = group[0]!;
    const box = boxOf(node, face);
    const axis = along(face);
    const lo = (axis === "x" ? box.x : box.y) + INSET;
    const hi = (axis === "x" ? box.x + box.width : box.y + box.height) - INSET;
    const centre = (lo + hi) / 2;
    group.sort((a, b) => a.toward - b.toward || a.edge.localeCompare(b.edge));
    const wanted = Math.max(SLOT_GAP, ...group.map((e) => (e.chip ?? 0) + 6));
    if (group.length >= 3 && (hi - lo) / (group.length - 1) < wanted) {
      // Too many edges for the face (a hub icon): one shared port and trunk
      // that branches, instead of a comb of lines too close to label.
      for (const e of group) {
        out.set(endKey(e.edge, e.node), Math.round(centre));
        bundles.set(endKey(e.edge, e.node), key);
      }
      continue;
    }
    const gap = Math.min(wanted, (hi - lo) / Math.max(1, group.length - 1));
    const shifted = group.map((e, i) => Math.min(hi, Math.max(lo, e.want ?? centre)) - i * gap);
    const fit = pava(shifted).map((v, i) => v + i * gap);
    const over = Math.max(0, fit[fit.length - 1]! - hi);
    const under = Math.max(0, lo - (fit[0]! - over));
    // Clamped last: a pooled PAVA block can still straddle the face ends.
    group.forEach((e, i) =>
      out.set(
        endKey(e.edge, e.node),
        Math.round(Math.min(hi, Math.max(lo, fit[i]! - over + under))),
      ),
    );
  }
  return { slots: out, bundles };
}

/** Closest non-decreasing sequence to `v` in least squares. */
function pava(v: number[]): number[] {
  const blocks: { sum: number; n: number }[] = [];
  for (const x of v) {
    blocks.push({ sum: x, n: 1 });
    while (
      blocks.length > 1 &&
      blocks[blocks.length - 2]!.sum / blocks[blocks.length - 2]!.n >
        blocks[blocks.length - 1]!.sum / blocks[blocks.length - 1]!.n
    ) {
      const b = blocks.pop()!;
      blocks[blocks.length - 1]!.sum += b.sum;
      blocks[blocks.length - 1]!.n += b.n;
    }
  }
  return blocks.flatMap((b) => Array<number>(b.n).fill(b.sum / b.n));
}

/**
 * Moves one end of an edge onto the other end's coordinate when the two faces
 * look at each other, so the edge is one straight run instead of a jog. Only
 * taken when the moved port stays on its face and clear of its neighbours.
 */
export function alignPairs(
  pairs: { edge: string; a: Box; fa: Face; b: Box; fb: Face; na: string; nb: string }[],
  slots: Map<string, number>,
  endpoints: Endpoint[],
  bundled: Map<string, string>,
): void {
  const opposite: Record<Face, Face> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  for (const p of pairs) {
    if (opposite[p.fa] !== p.fb) continue;
    const gapAhead =
      p.fa === "right"
        ? p.b.x - (p.a.x + p.a.width)
        : p.fa === "left"
          ? p.a.x - (p.b.x + p.b.width)
          : p.fa === "bottom"
            ? p.b.y - (p.a.y + p.a.height)
            : p.a.y - (p.b.y + p.b.height);
    if (gapAhead <= 0) continue;
    const sa = slots.get(endKey(p.edge, p.na))!;
    const sb = slots.get(endKey(p.edge, p.nb))!;
    if (sa === sb) continue;
    const tryMove = (node: string, face: Face, box: Box, to: number) => {
      if (bundled.has(endKey(p.edge, node))) return false;
      const axis = along(face);
      const lo = (axis === "x" ? box.x : box.y) + INSET;
      const hi = (axis === "x" ? box.x + box.width : box.y + box.height) - INSET;
      if (to < lo || to > hi) return false;
      const others = endpoints.filter(
        (e) => e.node === node && e.face === face && e.edge !== p.edge,
      );
      if (others.some((e) => Math.abs(slots.get(endKey(e.edge, node))! - to) < SLOT_GAP))
        return false;
      slots.set(endKey(p.edge, node), to);
      return true;
    };
    if (!tryMove(p.nb, p.fb, p.b, sa)) tryMove(p.na, p.fa, p.a, sb);
  }
}
