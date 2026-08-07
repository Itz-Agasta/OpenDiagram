import type { Box, EdgeRoute, PositionedSpec } from "../geometry.js";
import { edgeLabelText } from "../measure.js";

/**
 * Geometric defect counts for a laid-out spec. Pure functions over
 * `PositionedSpec`, with no rendering, no image, no model.
 */
export interface Metrics {
  edges: number;
  /** Direction changes, not vertex count: collinear points are not bends. */
  bends: number;
  crossings: number;
  /** Edges whose polyline passes through a node that is not an endpoint. */
  edgeThroughNode: number;
  labelCollisions: number;
  /** Edges beyond the first carrying an identical label. */
  duplicateLabels: number;
  nodeOverlaps: number;
  /** Edges running against `meta.direction`. */
  backEdges: number;
  aspect: number;
  /** Edges with no route at all; layout dropped them. */
  unrouted: number;
  /** Spec ids behind each count, so diagnostics can point at something. */
  offenders: Offenders;
}

export interface Offenders {
  /** Label text repeated across edges, with the edges carrying it. */
  duplicateLabel: { text: string; edges: string[] }[];
  crossing: [string, string][];
  edgeThroughNode: { edge: string; node: string }[];
  labelCollision: string[];
  nodeOverlap: [string, string][];
  backEdge: string[];
  unrouted: string[];
}

type Point = { x: number; y: number };
type Segment = [Point, Point];

// Coordinates come from ELK as floats; anything under half a pixel is noise,
// not a real turn or a real overlap.
const EPS = 0.5;
// Endpoints legitimately touch the node they bind to, so shrink boxes before
// testing "passes through". Also absorbs the binding gap.
const NODE_INSET = 4;

function segments(route: EdgeRoute): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < route.points.length; i++) out.push([route.points[i - 1]!, route.points[i]!]);
  return out;
}

function bendsIn(route: EdgeRoute): number {
  let n = 0;
  for (let i = 1; i < route.points.length - 1; i++) {
    const a = route.points[i - 1]!;
    const b = route.points[i]!;
    const c = route.points[i + 1]!;
    const before = Math.abs(b.x - a.x) > EPS ? "h" : "v";
    const after = Math.abs(c.x - b.x) > EPS ? "h" : "v";
    if (before !== after) n++;
  }
  return n;
}

function orient(a: Point, b: Point, c: Point): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

/** Proper crossing only: segments sharing an endpoint are edges meeting, not crossing. */
function segmentsCross([p1, p2]: Segment, [p3, p4]: Segment): boolean {
  for (const a of [p1, p2]) {
    for (const b of [p3, p4]) {
      if (Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2) return false;
    }
  }
  return orient(p1, p2, p3) !== orient(p1, p2, p4) && orient(p3, p4, p1) !== orient(p3, p4, p2);
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function segmentHitsBox(seg: Segment, box: Box): boolean {
  const x1 = box.x + NODE_INSET;
  const y1 = box.y + NODE_INSET;
  const x2 = box.x + box.width - NODE_INSET;
  const y2 = box.y + box.height - NODE_INSET;
  if (x2 <= x1 || y2 <= y1) return false;
  const [p, q] = seg;
  // Orthogonal segments: an axis-aligned overlap test is exact and cheaper
  // than four edge intersections.
  return (
    Math.min(p.x, q.x) < x2 &&
    Math.max(p.x, q.x) > x1 &&
    Math.min(p.y, q.y) < y2 &&
    Math.max(p.y, q.y) > y1
  );
}

export function computeMetrics(spec: PositionedSpec): Metrics {
  const routes = Object.entries(spec.edgeRoutes);
  const edgeById = new Map(spec.edges.map((e) => [e.id, e]));
  const nodes = Object.entries(spec.positions);

  let bends = 0;
  const allSegments: { seg: Segment; edge: string }[] = [];
  for (const [id, route] of routes) {
    bends += bendsIn(route);
    for (const seg of segments(route)) allSegments.push({ seg, edge: id });
  }

  const crossing: [string, string][] = [];
  const seenPair = new Set<string>();
  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      const a = allSegments[i]!;
      const b = allSegments[j]!;
      if (a.edge === b.edge) continue;
      if (!segmentsCross(a.seg, b.seg)) continue;
      // Report each edge PAIR once even when their polylines cross twice,
      // a reader sees one tangle, not two.
      const key = a.edge < b.edge ? `${a.edge}|${b.edge}` : `${b.edge}|${a.edge}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      crossing.push(a.edge < b.edge ? [a.edge, b.edge] : [b.edge, a.edge]);
    }
  }

  const edgeThroughNode: { edge: string; node: string }[] = [];
  for (const [id, route] of routes) {
    const edge = edgeById.get(id);
    const segs = segments(route);
    for (const [nodeId, box] of nodes) {
      if (nodeId === edge?.from || nodeId === edge?.to) continue;
      if (segs.some((s) => segmentHitsBox(s, box)))
        edgeThroughNode.push({ edge: id, node: nodeId });
    }
  }

  // A box with no text draws nothing, so it can neither collide nor widen the
  // diagram. Matches `renderEdge`, which needs BOTH before it emits a chip.
  const labelled = routes.filter((r): r is [string, EdgeRoute & { label: Box }] => {
    const edge = edgeById.get(r[0]);
    return !!r[1].label && !!edge && edgeLabelText(edge) !== undefined;
  });
  const labelCollision: string[] = [];
  for (let i = 0; i < labelled.length; i++) {
    const [id, route] = labelled[i]!;
    const hitsNode = nodes.some(([, box]) => boxesOverlap(route.label, box));
    const hitsLabel = labelled.some((o, j) => j !== i && boxesOverlap(route.label, o[1].label));
    if (hitsNode || hitsLabel) labelCollision.push(id);
  }

  const nodeOverlap: [string, string][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (boxesOverlap(nodes[i]![1], nodes[j]![1])) nodeOverlap.push([nodes[i]![0], nodes[j]![0]]);
    }
  }

  const direction = spec.meta?.direction ?? (spec.type === "erd" ? "TB" : "LR");
  const backEdge: string[] = [];
  for (const [id, route] of routes) {
    const first = route.points[0]!;
    const last = route.points[route.points.length - 1]!;
    const back =
      (direction === "LR" && last.x < first.x - 8) ||
      (direction === "RL" && last.x > first.x + 8) ||
      (direction === "TB" && last.y < first.y - 8) ||
      (direction === "BT" && last.y > first.y + 8);
    if (back) backEdge.push(id);
  }

  // Only ever fires on edges in DIFFERENT corridors: `dedupeCorridorLabels` has
  // already stripped the stacked-in-one-gap case by the time we measure. Those
  // survivors are the ones sanitize deliberately keeps, and this still counts
  // them, because the two passes carry different risk: sanitize DELETES a
  // label, so it stays conservative; the report only advises the model, which
  // can drop a redundant "HTTPS" or leave it. Do not "fix" the mismatch by
  // scoping this to corridors: sanitize guarantees that count is zero.
  const byLabel = new Map<string, string[]>();
  for (const edge of spec.edges) {
    const text = edgeLabelText(edge);
    if (!text || !edge.id) continue;
    byLabel.set(text, [...(byLabel.get(text) ?? []), edge.id]);
  }
  const duplicateLabel = [...byLabel]
    .filter(([, edges]) => edges.length > 1)
    .map(([text, edges]) => ({ text, edges }));

  // `layoutDiagram` assigns every edge an id during sanitize, but the shared
  // `DiagramEdge` type keeps it optional for hand-written specs.
  const routed = new Set(routes.map(([id]) => id));
  const unrouted = spec.edges
    .map((e) => e.id)
    .filter((id): id is string => id !== undefined && !routed.has(id));

  // Route points and label chips count toward the bounds, not just node boxes.
  // A back edge loops through the margin outside every node, so nodes alone
  // measured one 4-node retry loop at aspect 6.14 where the drawn diagram is
  // 5.58, the shape the reader sees and the shape the aspect gate is about.
  const boxes = [
    ...Object.values(spec.positions),
    ...Object.values(spec.groupBoxes),
    ...Object.values(spec.zoneBoxes),
    ...routes.flatMap(([, route]) => route.points.map((p) => ({ ...p, width: 0, height: 0 }))),
    ...labelled.map(([, route]) => route.label),
  ];
  let aspect = 1;
  if (boxes.length > 0) {
    const width = Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x));
    const height =
      Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y));
    aspect = width / Math.max(height, 1);
  }

  return {
    edges: spec.edges.length,
    bends,
    crossings: crossing.length,
    edgeThroughNode: edgeThroughNode.length,
    labelCollisions: labelCollision.length,
    duplicateLabels: duplicateLabel.reduce((n, d) => n + d.edges.length - 1, 0),
    nodeOverlaps: nodeOverlap.length,
    backEdges: backEdge.length,
    aspect,
    unrouted: unrouted.length,
    offenders: {
      duplicateLabel,
      crossing,
      edgeThroughNode,
      labelCollision,
      nodeOverlap,
      backEdge,
      unrouted,
    },
  };
}
