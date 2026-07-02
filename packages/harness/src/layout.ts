import dagre from "dagre";
import type { DiagramSpec } from "./schema.js";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedSpec extends DiagramSpec {
  positions: Record<string, Box>;
  groupBoxes: Record<string, Box>;
  zoneBoxes: Record<string, Box>;
}

const NODE_BOX = { width: 150, height: 90 };
const ZONE_MARGIN = 40;

/**
 * Lays out a DiagramSpec with dagre. Only `groups` become dagre compound
 * (parent) nodes -- `zones` are computed post-hoc as the bounding box of their
 * members, to avoid 3-level compound nesting (the least battle-tested part
 * of dagre's compound-graph support).
 *
 * LLM output can reference ids that don't exist (hallucinated node/edge
 * endpoints, a node listed in two groups) — sanitized defensively so bad
 * output degrades gracefully instead of throwing.
 */
export function layoutDiagram(spec: DiagramSpec): PositionedSpec {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: spec.meta?.direction ?? "LR",
    nodesep: 80,
    ranksep: 120,
    marginx: 50,
    marginy: 50,
  });

  const nodeIds = new Set(spec.nodes.map((n) => n.id));

  for (const node of spec.nodes) {
    g.setNode(node.id, { ...NODE_BOX });
  }

  const claimedNodes = new Set<string>();
  const validGroups: { id: string; contains: string[] }[] = [];
  for (const group of spec.groups ?? []) {
    const contains = group.contains.filter((id) => nodeIds.has(id) && !claimedNodes.has(id));
    if (contains.length === 0) {
      if (group.contains.length > 0) {
        console.warn(`layoutDiagram: dropping group "${group.id}" — no valid unclaimed nodes`);
      }
      continue;
    }
    for (const id of contains) claimedNodes.add(id);
    validGroups.push({ id: group.id, contains });
  }

  for (const group of validGroups) {
    g.setNode(group.id, {});
    for (const childId of group.contains) {
      g.setParent(childId, group.id);
    }
  }

  for (const edge of spec.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      console.warn(
        `layoutDiagram: dropping edge with unknown endpoint (${edge.from} -> ${edge.to})`,
      );
      continue;
    }
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const positions: Record<string, Box> = {};
  for (const id of nodeIds) {
    const n = g.node(id);
    positions[id] = {
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
      width: n.width,
      height: n.height,
    };
  }

  const groupBoxes: Record<string, Box> = {};
  for (const group of validGroups) {
    const n = g.node(group.id);
    groupBoxes[group.id] = {
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
      width: n.width,
      height: n.height,
    };
  }

  const zoneBoxes: Record<string, Box> = {};
  for (const zone of spec.zones ?? []) {
    const memberBoxes = zone.contains
      .map((id) => positions[id] ?? groupBoxes[id])
      .filter((box): box is Box => box !== undefined);
    if (memberBoxes.length === 0) {
      console.warn(`layoutDiagram: dropping zone "${zone.id}" — no valid members`);
      continue;
    }
    const minX = Math.min(...memberBoxes.map((b) => b.x)) - ZONE_MARGIN;
    const minY = Math.min(...memberBoxes.map((b) => b.y)) - ZONE_MARGIN;
    const maxX = Math.max(...memberBoxes.map((b) => b.x + b.width)) + ZONE_MARGIN;
    const maxY = Math.max(...memberBoxes.map((b) => b.y + b.height)) + ZONE_MARGIN;
    zoneBoxes[zone.id] = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  return { ...spec, positions, groupBoxes, zoneBoxes };
}
