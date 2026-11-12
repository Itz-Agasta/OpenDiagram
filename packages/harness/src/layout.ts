import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { Box, PositionedSpec } from "./geometry.js";
import { alignColumns } from "./layout/align.js";
import { arrangedLayout, containerBoxes } from "./layout/arrange.js";
import { laneLayout } from "./layout/lanes.js";
import { BASE_OPTIONS, containerOptions, elk, elkEdge } from "./layout/elk-common.js";
import { type LayoutGeometry, twoPhaseLayout } from "./layout/macro.js";
import { routeGeometry } from "./layout/route.js";
import type { RouterEdge } from "./router/index.js";
import { sanitize, type Sanitized } from "./layout/sanitize.js";
import { reorderStacks } from "./layout/reorder.js";
import { straightenRows } from "./layout/straighten.js";
import { buildReport } from "./report/index.js";
import { nodeSize } from "./measure.js";
import type { DiagramSpec } from "./schema.js";
import { classicTheme, type Theme } from "./theme/index.js";

export type EdgeSides = NonNullable<RouterEdge["sides"]>;

export type { Box, EdgeRoute, PositionedSpec } from "./geometry.js";

const flowDirection = (spec: DiagramSpec) =>
  spec.meta?.direction ?? (spec.type === "erd" ? "TB" : "LR");

const DIRECTION: Record<string, string> = { LR: "RIGHT", TB: "DOWN", BT: "UP", RL: "LEFT" };

function buildGraph(
  spec: DiagramSpec,
  s: Sanitized,
  theme: Theme,
  extra: Record<string, string> = {},
): ElkNode {
  const elkNodes = new Map<string, ElkNode>();
  for (const node of spec.nodes) {
    elkNodes.set(node.id, { id: node.id, ...nodeSize(node, theme, s.nodeParent.has(node.id)) });
  }

  const named = new Map([...(spec.groups ?? []), ...(spec.zones ?? [])].map((c) => [c.id, c]));
  const vertical = ["TB", "BT"].includes(flowDirection(spec));
  const options = (id: string) => containerOptions(named.get(id) ?? { label: "" }, theme, vertical);
  const elkGroups = new Map<string, ElkNode>();
  for (const group of s.groups) {
    elkGroups.set(group.id, {
      id: group.id,
      layoutOptions: options(group.id),
      children: group.contains.map((id) => elkNodes.get(id)!),
    });
  }

  const rootChildren: ElkNode[] = [];
  for (const zone of s.zones) {
    rootChildren.push({
      id: zone.id,
      layoutOptions: options(zone.id),
      children: zone.contains.map((id) => elkGroups.get(id) ?? elkNodes.get(id)!),
    });
  }
  for (const group of s.groups) {
    if (![...s.zones].some((z) => z.contains.includes(group.id))) {
      rootChildren.push(elkGroups.get(group.id)!);
    }
  }
  for (const node of spec.nodes) {
    if (!s.nodeParent.has(node.id)) rootChildren.push(elkNodes.get(node.id)!);
  }

  return {
    id: "root",
    layoutOptions: {
      ...BASE_OPTIONS,
      // ERDs read best top-down (parent tables above children); flows read LR.
      "elk.direction":
        DIRECTION[spec.meta?.direction ?? (spec.type === "erd" ? "TB" : "LR")] ?? "RIGHT",
      ...extra,
    },
    children: rootChildren,
    edges: s.edges.map((edge) => elkEdge(edge, theme)),
  };
}

function aspect(geo: LayoutGeometry): number {
  const boxes = [
    ...Object.values(geo.positions),
    ...Object.values(geo.groupBoxes),
    ...Object.values(geo.zoneBoxes),
  ];
  const width = Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x));
  const height = Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y));
  return width / height;
}

/** Single-run ELK layout of the whole spec (nested compounds, one direction). */
async function singleRunLayout(
  spec: DiagramSpec,
  s: Sanitized,
  theme: Theme,
  extra?: Record<string, string>,
): Promise<LayoutGeometry> {
  const laidOut = await elk.layout(buildGraph(spec, s, theme, extra));

  const positions: Record<string, Box> = {};
  const groupBoxes: Record<string, Box> = {};
  const zoneBoxes: Record<string, Box> = {};
  const groupIds = new Set(s.groups.map((g) => g.id));
  const zoneIds = new Set(s.zones.map((z) => z.id));

  // Child coordinates are relative to their parent — flatten to absolute.
  const walk = (node: ElkNode, offsetX: number, offsetY: number) => {
    for (const child of node.children ?? []) {
      const box: Box = {
        x: offsetX + (child.x ?? 0),
        y: offsetY + (child.y ?? 0),
        width: child.width ?? 0,
        height: child.height ?? 0,
      };
      if (zoneIds.has(child.id)) zoneBoxes[child.id] = box;
      else if (groupIds.has(child.id)) groupBoxes[child.id] = box;
      else positions[child.id] = box;
      walk(child, box.x, box.y);
    }
  };
  walk(laidOut, laidOut.x ?? 0, laidOut.y ?? 0);

  return { positions, groupBoxes, zoneBoxes };
}

/**
 * Lays out a DiagramSpec: ELK places nodes (layered, nested compounds), polish
 * passes square up columns and rows, then the router draws every edge and
 * places its label against the final boxes.
 *
 * Specs with several top-level containers also get the two-phase fold layout
 * (see layout/macro.ts); both are routed and the better report score wins.
 */
export async function layoutDiagram(
  spec: DiagramSpec,
  theme: Theme = classicTheme,
  opts?: { strategy?: "auto" | "single" | "two-phase" },
): Promise<PositionedSpec> {
  const s = sanitize(spec);
  const strategy = opts?.strategy ?? "auto";
  // Replication runs between mirrored stacks (primary/replica region) and says
  // nothing about flow order. Placed by it, the replica ranks after the primary
  // and the diagram becomes a ribbon; unplaced, the two stack and the router
  // drops the sync edges straight across. Measured: azure HA/DR 72 -> 94.
  // Same for pushes back to a client ("push notification" into the mobile
  // app): a client that also sends requests is a source, and ranking it by
  // the push drops it at the far end, so its own request loops the diagram.
  const category = new Map(spec.nodes.map((n) => [n.id, n.category]));
  const initiators = new Set(s.edges.map((e) => e.from));
  const intoClient = (e: { from: string; to: string }) =>
    e.from !== e.to &&
    initiators.has(e.to) &&
    ["client", "user"].includes(category.get(e.to) ?? "");
  // A node reached ONLY by replication (a DR replica fed by two primaries) keeps
  // those edges: with none left it ranks first and its edges cross everything.
  const placedBy = (id: string) =>
    s.edges.some(
      (e) => e.kind !== "replication" && !intoClient(e) && (e.from === id || e.to === id),
    );
  const placing: Sanitized = {
    ...s,
    edges: s.edges.filter(
      (e) => !intoClient(e) && (e.kind !== "replication" || !placedBy(e.from) || !placedBy(e.to)),
    ),
  };

  const candidates: LayoutGeometry[] = [];
  // Dictated placement is the only candidate: the author asked for those cells.
  const arranged = arrangedLayout(spec, s, theme);
  if (arranged) candidates.push(arranged);
  const swimlanes =
    !arranged &&
    (spec.type === "bpmn" ||
      (s.groups.length > 1 && (spec.groups ?? []).every((g) => g.style === "swimlane")));
  let lanes: LayoutGeometry | null = null;
  try {
    if (swimlanes) lanes = await laneLayout(spec, placing, theme);
  } catch (error) {
    s.warnings.push(`swimlane layout failed, using the general layout: ${String(error)}`);
  }
  if (lanes) candidates.push(lanes);
  const topContainers =
    s.zones.length + s.groups.filter((g) => !s.zones.some((z) => z.contains.includes(g.id))).length;
  if (
    !arranged &&
    !lanes &&
    strategy !== "single" &&
    spec.type !== "sequence" &&
    topContainers >= 2
  ) {
    try {
      const folded = await twoPhaseLayout(spec, placing, theme);
      if (folded) {
        reorderStacks(folded, s, placing.edges, ["LR", "RL"].includes(flowDirection(spec)));
        candidates.push(folded);
      }
    } catch (error) {
      s.warnings.push(`two-phase layout failed, using single-run: ${String(error)}`);
    }
  }
  let single: LayoutGeometry | undefined;
  if (!arranged && !lanes && (strategy !== "two-phase" || candidates.length === 0)) {
    single = await singleRunLayout(spec, placing, theme);
    candidates.push(single);
  }
  // A wrapped run: ELK cuts a long layering into chunks placed side by side.
  // Only a candidate, and only tried on a ribbon (a second ELK run and route
  // cost +230 ms a view when always on); the report still picks. Measured on
  // 190 eval views: mean score 78.5 -> 83.9, views wider than 4:1 from 54 to
  // 12. SINGLE_EDGE throws NoSuchElementException inside elkjs 0.11.1 on most
  // graphs; don't switch.
  // https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-strategy.html
  if (single && strategy === "auto" && spec.nodes.length >= 5 && aspect(single) > 3) {
    try {
      candidates.push(
        await singleRunLayout(spec, placing, theme, {
          "elk.layered.wrapping.strategy": "MULTI_EDGE",
          "elk.aspectRatio": "2.0",
        }),
      );
    } catch (error) {
      s.warnings.push(`wrapped layout failed: ${String(error)}`);
    }
  }

  let best: { positioned: PositionedSpec; score: number } | undefined;
  for (const geo of candidates) {
    if (geo !== lanes && geo !== arranged) {
      alignColumns(spec, geo.positions);
      straightenRows(geo, s, placing.edges, ["LR", "RL"].includes(flowDirection(spec)));
    }
    const { routes, warnings } = routeGeometry(spec, s, geo, theme);
    const positioned: PositionedSpec = {
      ...spec,
      edges: s.edges,
      ...geo,
      edgeRoutes: routes,
      containedNodeIds: [...s.nodeParent.keys()],
      warnings: [...s.warnings, ...warnings],
    };
    const score = buildReport(positioned).score;
    if (!best || score > best.score) best = { positioned, score };
  }
  return best!.positioned;
}

/**
 * Re-solves a diagram around node positions someone else chose (an agent's fix,
 * a user's drag): boxes are re-wrapped, every edge re-routed, nothing re-placed.
 * `at` is each node's top-left; a node missing from it keeps `fallback`'s spot.
 * `sides` pins which face an edge leaves and enters by; the router does the rest.
 */
export function layoutPinned(
  spec: DiagramSpec,
  at: Record<string, { x: number; y: number }>,
  fallback: Record<string, Box>,
  theme: Theme = classicTheme,
  sides: Record<string, EdgeSides> = {},
): PositionedSpec {
  const s = sanitize(spec);
  const positions: Record<string, Box> = {};
  for (const node of spec.nodes) {
    const size = nodeSize(node, theme, s.nodeParent.has(node.id));
    const spot = at[node.id] ?? fallback[node.id] ?? { x: 0, y: 0 };
    positions[node.id] = { x: Math.round(spot.x), y: Math.round(spot.y), ...size };
  }
  const geo = { positions, ...containerBoxes(spec, s, positions, theme, false) };
  const { routes, warnings } = routeGeometry(spec, s, geo, theme, sides);
  return {
    ...spec,
    edges: s.edges,
    ...geo,
    edgeRoutes: routes,
    containedNodeIds: [...s.nodeParent.keys()],
    warnings: [...s.warnings, ...warnings],
  };
}
