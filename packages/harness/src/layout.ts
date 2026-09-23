import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { Box, PositionedSpec } from "./geometry.js";
import { alignColumns } from "./layout/align.js";
import { laneLayout } from "./layout/lanes.js";
import { BASE_OPTIONS, CONTAINER_OPTIONS, elk, elkEdge } from "./layout/elk-common.js";
import { type LayoutGeometry, twoPhaseLayout } from "./layout/macro.js";
import { routeGeometry } from "./layout/route.js";
import { sanitize, type Sanitized } from "./layout/sanitize.js";
import { reorderStacks } from "./layout/reorder.js";
import { straightenRows } from "./layout/straighten.js";
import { buildReport } from "./report/index.js";
import { nodeSize } from "./measure.js";
import type { DiagramSpec } from "./schema.js";
import { classicTheme, type Theme } from "./theme/index.js";

export type { Box, EdgeRoute, PositionedSpec } from "./geometry.js";

const flowDirection = (spec: DiagramSpec) =>
  spec.meta?.direction ?? (spec.type === "erd" ? "TB" : "LR");

const DIRECTION: Record<string, string> = { LR: "RIGHT", TB: "DOWN", BT: "UP", RL: "LEFT" };

function buildGraph(spec: DiagramSpec, s: Sanitized, theme: Theme): ElkNode {
  const elkNodes = new Map<string, ElkNode>();
  for (const node of spec.nodes) {
    elkNodes.set(node.id, { id: node.id, ...nodeSize(node, theme, s.nodeParent.has(node.id)) });
  }

  const elkGroups = new Map<string, ElkNode>();
  for (const group of s.groups) {
    elkGroups.set(group.id, {
      id: group.id,
      layoutOptions: CONTAINER_OPTIONS,
      children: group.contains.map((id) => elkNodes.get(id)!),
    });
  }

  const rootChildren: ElkNode[] = [];
  for (const zone of s.zones) {
    rootChildren.push({
      id: zone.id,
      layoutOptions: CONTAINER_OPTIONS,
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
    },
    children: rootChildren,
    edges: s.edges.map((edge) => elkEdge(edge, theme)),
  };
}

/** Single-run ELK layout of the whole spec (nested compounds, one direction). */
async function singleRunLayout(
  spec: DiagramSpec,
  s: Sanitized,
  theme: Theme,
): Promise<LayoutGeometry> {
  const laidOut = await elk.layout(buildGraph(spec, s, theme));

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
  const placing: Sanitized = {
    ...s,
    edges: s.edges.filter((e) => e.kind !== "replication" && !intoClient(e)),
  };

  const candidates: LayoutGeometry[] = [];
  const swimlanes =
    spec.type === "bpmn" ||
    (s.groups.length > 1 && (spec.groups ?? []).every((g) => g.style === "swimlane"));
  const lanes = swimlanes ? await laneLayout(spec, placing, theme) : null;
  if (lanes) candidates.push(lanes);
  const topContainers =
    s.zones.length + s.groups.filter((g) => !s.zones.some((z) => z.contains.includes(g.id))).length;
  if (!lanes && strategy !== "single" && spec.type !== "sequence" && topContainers >= 2) {
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
  if (!lanes && (strategy !== "two-phase" || candidates.length === 0))
    candidates.push(await singleRunLayout(spec, placing, theme));

  let best: { positioned: PositionedSpec; score: number } | undefined;
  for (const geo of candidates) {
    if (geo !== lanes) {
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
