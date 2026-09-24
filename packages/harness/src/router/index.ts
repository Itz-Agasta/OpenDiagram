import type { Box, EdgeRoute } from "../geometry.js";
import { buildGrid, CLEARANCE, type Grid, inflate, obstaclesFor } from "./grid.js";
import { placeLabels } from "./labels.js";
import { alignBundles } from "./bundles.js";
import { pinPorts, towardKey, wantAt } from "./pins.js";
import { type Endpoint, faceCosts, portPoint } from "./ports.js";
import { routingCost } from "./quality.js";
import { swapRepair } from "./repair.js";
import { type Occupied, search, type Terminal } from "./search.js";
import {
  FACES,
  type Face,
  faceBox,
  type Point,
  type RouterEdge,
  type RouterInput,
  type RouterNode,
} from "./types.js";

export type { RouterContainer, RouterEdge, RouterInput, RouterNode } from "./types.js";

// Port-order rounds. Each re-derives port order from the previous round's
// routes and reroutes every edge against all the others.
const ROUNDS = 3;

const mid = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const alongFace = (f: Face) => (f === "left" || f === "right" ? "y" : "x");

/**
 * Orthogonal edge router. Runs after placement, so node boxes are final and
 * nothing here moves them. Pass 1 picks each endpoint's face. Then a few
 * rounds of: spread ports on those faces in the order the last routing implies,
 * route every edge against all the others, keep the best round. Then a
 * port-swap repair, bundle buses squared up, and label chips placed.
 */
export function routeEdges(input: RouterInput): {
  routes: Record<string, EdgeRoute>;
  fallbacks: string[];
} {
  const nodes = new Map(input.nodes.map((n) => [n.id, n]));
  const containers = new Map(input.containers.map((c) => [c.id, c]));
  const edges = input.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
  const straight = edges.filter((e) => e.from !== e.to);
  const length = (e: RouterEdge) => {
    const a = mid(nodes.get(e.from)!);
    const b = mid(nodes.get(e.to)!);
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  };
  straight.sort((a, b) => length(a) - length(b) || a.id.localeCompare(b.id));
  const obstacles = new Map(
    straight.map((e) => [
      e.id,
      obstaclesFor(nodes.get(e.from)!, nodes.get(e.to)!, input, containers),
    ]),
  );

  // Pass 1: faces. Every face is on offer at its centre.
  const coarse = buildGrid(input, {
    xs: input.nodes.map((n) => mid(n.anchor ?? n).x),
    ys: input.nodes.map((n) => mid(n.anchor ?? n).y),
  });
  const occupied: Occupied[] = [];
  const faces = new Map<string, [Face, Face]>();
  let routes = new Map<string, Point[]>();
  for (const e of straight) {
    const [a, b] = [nodes.get(e.from)!, nodes.get(e.to)!];
    const sc = faceCosts(a, b, "source", input.direction);
    const tc = faceCosts(b, a, "target", input.direction);
    const sources = FACES.map((f) => terminal(a, f, sc[f]));
    const found = search(
      coarse,
      sources,
      FACES.map((f) => terminal(b, f, tc[f])),
      obstacles.get(e.id)!,
      occupied,
    );
    faces.set(e.id, found ? [found.source.face, found.target.face] : ["right", "left"]);
    const pts = found?.points ?? [mid(a), mid(b)];
    routes.set(e.id, pts);
    record(occupied, e.id, pts);
  }

  let best:
    | {
        cost: number;
        routes: Map<string, Point[]>;
        fallbacks: string[];
        ports: Map<string, [Terminal, Terminal]>;
        grid: Grid;
        bundles: Map<string, string[]>;
      }
    | undefined;
  for (let round = 0; round < ROUNDS; round++) {
    const endpoints = straight.flatMap((e): Endpoint[] => {
      const [fs, ft] = faces.get(e.id)!;
      const pts = routes.get(e.id)!;
      const chip = e.label?.height;
      const rev = [...pts].reverse();
      return [
        {
          edge: e.id,
          node: e.from,
          face: fs,
          toward: towardKey(pts, faceBox(nodes.get(e.from)!, fs), fs),
          want: wantAt(pts, faceBox(nodes.get(e.from)!, fs), fs),
          chip,
        },
        {
          edge: e.id,
          node: e.to,
          face: ft,
          toward: towardKey(rev, faceBox(nodes.get(e.to)!, ft), ft),
          want: wantAt(rev, faceBox(nodes.get(e.to)!, ft), ft),
          chip,
        },
      ];
    });
    const { ports, bundles } = pinPorts(straight, faces, endpoints, nodes);
    const extra = { xs: [] as number[], ys: [] as number[] };
    for (const pair of ports.values())
      for (const p of pair)
        (alongFace(p.face) === "x" ? extra.xs : extra.ys).push(p.port[alongFace(p.face)]);
    const grid = buildGrid(input, extra);
    // Later rounds see everyone else's previous route, so early edges no
    // longer get first pick of the channels.
    const previous = routes;
    const next = new Map<string, Point[]>();
    const fallbacks: string[] = [];
    const committed: Occupied[] = [];
    for (const e of straight) {
      const others = [...committed];
      if (round > 0)
        for (const [id, pts] of previous)
          if (id !== e.id && !next.has(id)) record(others, id, pts, bundles.get(id));
      const routed = routeOne(
        e,
        ports.get(e.id)!,
        grid,
        obstacles.get(e.id)!,
        others,
        nodes,
        input,
        bundles.get(e.id),
      );

      if (!routed.ok) fallbacks.push(e.id);
      next.set(e.id, routed.points);
      record(committed, e.id, routed.points, bundles.get(e.id));
    }
    const cost = routingCost(next);
    if (!best || cost < best.cost) best = { cost, routes: next, fallbacks, ports, grid, bundles };
    routes = next;
  }

  const final = best!.routes;
  swapRepair(final, best!.ports, (id, pair, current) => {
    const others: Occupied[] = [];
    for (const [k, pts] of current) if (k !== id) record(others, k, pts, best!.bundles.get(k));
    return search(
      best!.grid,
      [pair[0]],
      [pair[1]],
      obstacles.get(id)!,
      others,
      best!.bundles.get(id),
      input.containers,
    )?.points;
  });
  const titles = input.containers.flatMap((c) => (c.title ? [c.title] : []));
  const sizes = new Map(edges.filter((e) => e.label).map((e) => [e.id, e.label!]));
  alignBundles(
    final,
    [...input.nodes, ...titles],
    best!.bundles,
    new Map(edges.map((e) => [e.id, e.from])),
  );
  for (const e of edges.filter((x) => x.from === x.to))
    final.set(e.id, selfLoop(nodes.get(e.from)!.anchor ?? nodes.get(e.from)!));
  const labels = placeLabels(final, sizes, input.nodes, titles, input.containers);
  const out: Record<string, EdgeRoute> = {};
  for (const [id, points] of final) out[id] = { points, label: labels.get(id) };
  return { routes: out, fallbacks: best!.fallbacks };
}

function routeOne(
  e: RouterEdge,
  [s, t]: [Terminal, Terminal],
  grid: Grid,
  obstacles: Box[],
  occupied: Occupied[],
  nodes: Map<string, RouterNode>,
  input: RouterInput,
  bundles: string[] = [],
): { points: Point[]; ok: boolean } {
  const [a, b] = [nodes.get(e.from)!, nodes.get(e.to)!];
  const nodesOnly = input.nodes.map((n) => (n === a || n === b ? n : inflate(n, CLEARANCE)));
  const found =
    search(grid, [s], [t], obstacles, occupied, bundles, input.containers) ??
    // FIXME: blocked by containers even with pinned ports; retry with only nodes solid.
    search(grid, [s], [t], nodesOnly, occupied, bundles);
  return found
    ? { points: found.points, ok: true }
    : { points: elbow(s.port, t.port, s.face), ok: false };
}

function terminal(node: RouterNode, face: Face, cost: number): Terminal {
  const box = faceBox(node, face);
  const c = mid(box);
  return {
    port: portPoint(box, face, Math.round(face === "left" || face === "right" ? c.y : c.x)),
    face,
    box,
    cost,
  };
}

function record(occupied: Occupied[], edge: string, pts: Point[], bundles?: string[]): void {
  for (let i = 0; i < pts.length - 1; i++)
    occupied.push({ a: pts[i]!, b: pts[i + 1]!, edge, bundles });
}

/** Last resort: a Z along the source face's axis. Crosses whatever is in the way. */
function elbow(a: Point, b: Point, face: Face): Point[] {
  if (face === "left" || face === "right") {
    const x = Math.round((a.x + b.x) / 2);
    return [a, { x, y: a.y }, { x, y: b.y }, b];
  }
  const y = Math.round((a.y + b.y) / 2);
  return [a, { x: a.x, y }, { x: b.x, y }, b];
}

function selfLoop(n: Box): Point[] {
  const r = n.x + n.width;
  const cy = n.y + n.height / 2;
  const top = n.y - 24;
  const cx = n.x + n.width * 0.75;
  return [
    { x: r, y: cy },
    { x: r + 28, y: cy },
    { x: r + 28, y: top },
    { x: cx, y: top },
    { x: cx, y: n.y },
  ];
}
