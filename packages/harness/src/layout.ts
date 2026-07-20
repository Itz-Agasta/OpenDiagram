import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { Box, EdgeRoute, PositionedSpec } from "./geometry.js";
import { alignColumns } from "./layout/align.js";
import { BASE_OPTIONS, CONTAINER_OPTIONS, elk, elkEdge } from "./layout/elk-common.js";
import { type LayoutGeometry, scoreLayout, twoPhaseLayout } from "./layout/macro.js";
import { sanitize, type Sanitized } from "./layout/sanitize.js";
import { nodeSize } from "./measure.js";
import type { DiagramSpec } from "./schema.js";
import { classicTheme, type Theme } from "./theme/index.js";

export type { Box, EdgeRoute, PositionedSpec } from "./geometry.js";

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

  const edgeRoutes: Record<string, EdgeRoute> = {};
  for (const edge of laidOut.edges ?? []) {
    const points = (edge.sections ?? []).flatMap((section) => [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
    if (points.length < 2) continue;
    const label = edge.labels?.[0];
    edgeRoutes[edge.id] = {
      points,
      label:
        label?.x !== undefined && label?.y !== undefined
          ? { x: label.x, y: label.y, width: label.width ?? 0, height: label.height ?? 0 }
          : undefined,
    };
  }

  alignColumns(spec, s.edges, positions, edgeRoutes);
  return { positions, groupBoxes, zoneBoxes, edgeRoutes };
}

/**
 * Lays out a DiagramSpec with ELK (layered, orthogonal routing). Zones and
 * groups are true nested compounds; edge labels get measured dimensions so ELK
 * reserves space for them and returns exact label boxes.
 *
 * Specs with several top-level containers additionally get the two-phase fold
 * layout (see layout/macro.ts); the better-scoring result wins.
 */
export async function layoutDiagram(
  spec: DiagramSpec,
  theme: Theme = classicTheme,
  opts?: { strategy?: "auto" | "single" | "two-phase" },
): Promise<PositionedSpec> {
  const s = sanitize(spec);
  const strategy = opts?.strategy ?? "auto";
  let geo = await singleRunLayout(spec, s, theme);

  const topContainers =
    s.zones.length + s.groups.filter((g) => !s.zones.some((z) => z.contains.includes(g.id))).length;
  if (strategy !== "single" && spec.type !== "sequence" && topContainers >= 2) {
    try {
      const folded = await twoPhaseLayout(spec, s, theme);
      if (folded && (strategy === "two-phase" || scoreLayout(folded) < scoreLayout(geo))) {
        geo = folded;
      }
    } catch (error) {
      s.warnings.push(`two-phase layout failed, using single-run: ${String(error)}`);
    }
  }

  return {
    ...spec,
    edges: s.edges,
    ...geo,
    containedNodeIds: [...s.nodeParent.keys()],
    warnings: s.warnings,
  };
}
