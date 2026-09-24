import type { Box } from "../geometry.js";
import { alignPairs, assignSlots, type Endpoint, endKey, portPoint } from "./ports.js";
import type { Terminal } from "./search.js";
import { type Face, faceBox, type Point, type RouterEdge, type RouterNode } from "./types.js";

const mid = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const alongFace = (f: Face) => (f === "left" || f === "right" ? "y" : "x");

/** Every edge's two terminals on its chosen faces, plus which ends share a bundle port. */
export function pinPorts(
  edges: RouterEdge[],
  faces: Map<string, [Face, Face]>,
  endpoints: Endpoint[],
  nodes: Map<string, RouterNode>,
): { ports: Map<string, [Terminal, Terminal]>; bundles: Map<string, string[]> } {
  const { slots, bundles: byEnd } = assignSlots(endpoints, (node, face) =>
    faceBox(nodes.get(node)!, face),
  );
  const bundles = new Map<string, string[]>();
  for (const e of endpoints) {
    const bundle = byEnd.get(endKey(e.edge, e.node));
    if (bundle) bundles.set(e.edge, [...(bundles.get(e.edge) ?? []), bundle]);
  }
  alignPairs(
    edges.map((e) => {
      const [fa, fb] = faces.get(e.id)!;
      const [a, b] = [nodes.get(e.from)!, nodes.get(e.to)!];
      return { edge: e.id, a: faceBox(a, fa), fa, b: faceBox(b, fb), fb, na: e.from, nb: e.to };
    }),
    slots,
    endpoints,
    byEnd,
  );
  const out = new Map<string, [Terminal, Terminal]>();
  for (const e of edges) {
    const [fs, ft] = faces.get(e.id)!;
    const [a, b] = [nodes.get(e.from)!, nodes.get(e.to)!];
    out.set(e.id, [
      {
        port: portPoint(faceBox(a, fs), fs, slots.get(endKey(e.id, a.id))!),
        face: fs,
        box: faceBox(a, fs),
        cost: 0,
      },
      {
        port: portPoint(faceBox(b, ft), ft, slots.get(endKey(e.id, b.id))!),
        face: ft,
        box: faceBox(b, ft),
        cost: 0,
      },
    ]);
  }
  return { ports: out, bundles };
}

/**
 * Sort key for a port, from the route that leaves it (port first). Routes that
 * turn toward the low end of the face sit on the low end; among those, the one
 * that turns farthest from the face sits nearest the face's middle, so the
 * L-shapes nest instead of crossing. Straight-out routes sit in between.
 */
export function towardKey(pts: Point[], box: Box, face: Face): number {
  const axis = alongFace(face);
  const normal = axis === "x" ? "y" : "x";
  const turn = pts[2];
  if (!turn || pts.length < 4) return (pts[pts.length - 1]![axis] - mid(box)[axis]) / 1e3;
  const side = Math.sign(turn[axis] - pts[1]![axis]);
  const dist = Math.abs(pts[1]![normal] - pts[0]![normal]);
  return side * 1e6 + side * (1e5 - dist);
}

/**
 * Where a port would like to sit: level with the far end when the route is
 * one straight run, otherwise the face centre. An L-route must not borrow the
 * far end's coordinate (that pinned arrows to an icon's corner), and ports
 * sharing a face are kept apart by slot order, not by this.
 */
export function wantAt(pts: Point[], box: Box, face: Face): number {
  const axis = alongFace(face);
  return pts.length === 2 ? pts[1]![axis] : mid(box)[axis];
}
