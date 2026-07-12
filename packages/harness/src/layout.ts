import { createRequire } from "node:module";
import ELK from "elkjs/lib/elk-api.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api.js";
import type { Box, EdgeRoute, PositionedSpec } from "./geometry.js";
import { alignColumns } from "./layout/align.js";
import { sanitize, type Sanitized } from "./layout/sanitize.js";
import {
  countTextLines,
  edgeLabelText,
  estimateTextHeight,
  estimateTextWidth,
  nodeSize,
} from "./measure.js";
import type { DiagramSpec } from "./schema.js";
import { classicTheme, type Theme } from "./theme/index.js";

export type { Box, EdgeRoute, PositionedSpec } from "./geometry.js";

const DIRECTION: Record<string, string> = { LR: "RIGHT", TB: "DOWN", BT: "UP", RL: "LEFT" };
// TUNABLE: room inside group/zone boxes; top holds the Medium-20 label row.
const CONTAINER_PADDING = "[top=56,left=24,bottom=24,right=24]";

// The worker script must run in a real Worker: Bun defines `self`, so loading
// it in-process makes it think it's already inside one (registers onmessage,
// exports nothing, never terminates). One persistent worker per process.
const elk = new ELK({
  workerUrl: createRequire(import.meta.url).resolve("elkjs/lib/elk-worker.min.js"),
});

function buildGraph(spec: DiagramSpec, s: Sanitized, theme: Theme): ElkNode {
  const elkNodes = new Map<string, ElkNode>();
  for (const node of spec.nodes) {
    elkNodes.set(node.id, { id: node.id, ...nodeSize(node, theme, s.nodeParent.has(node.id)) });
  }

  const containerOptions = { "elk.padding": CONTAINER_PADDING };
  const elkGroups = new Map<string, ElkNode>();
  for (const group of s.groups) {
    elkGroups.set(group.id, {
      id: group.id,
      layoutOptions: containerOptions,
      children: group.contains.map((id) => elkNodes.get(id)!),
    });
  }

  const rootChildren: ElkNode[] = [];
  for (const zone of s.zones) {
    rootChildren.push({
      id: zone.id,
      layoutOptions: containerOptions,
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

  const edges: ElkExtendedEdge[] = s.edges.map((edge) => {
    const text = edgeLabelText(edge);
    return {
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
      labels: text
        ? [
            {
              text,
              width: estimateTextWidth(text, theme.text.edgeLabel.size, theme.fontFamily) + 8,
              height: estimateTextHeight(theme.text.edgeLabel.size, countTextLines(text)) + 4,
              layoutOptions: { "elk.edgeLabels.inline": "true" },
            },
          ]
        : undefined,
    };
  });

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      // ERDs read best top-down (parent tables above children); flows read LR.
      "elk.direction":
        DIRECTION[spec.meta?.direction ?? (spec.type === "erd" ? "TB" : "LR")] ?? "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      // TUNABLE spacing (px): between columns/rows of nodes and around edges.
      // Bigger = airier diagram, smaller = denser.
      "elk.layered.spacing.nodeNodeBetweenLayers": "110", // gap between flow layers (arrow length + label corridors live here)
      "elk.layered.spacing.edgeNodeBetweenLayers": "32",
      "elk.spacing.nodeNode": "48", // gap between siblings in the same layer
      "elk.spacing.edgeNode": "32", // how close an edge may run past a node
      "elk.spacing.edgeEdge": "30", // gap between parallel edges (label chips need air)
      "elk.spacing.edgeLabel": "8",
      // Strip zero-benefit doglegs from orthogonal routes. (NETWORK_SIMPLEX
      // node placement was tried here and made routing WORSE — see future.md.)
      "elk.layered.unnecessaryBendpoints": "true",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      // Edge/section/label coordinates come back relative to the root instead
      // of each edge's containing node -- saves offset bookkeeping below.
      "elk.json.edgeCoords": "ROOT",
    },
    children: rootChildren,
    edges,
  };
}

/**
 * Lays out a DiagramSpec with ELK (layered, orthogonal routing). Zones and
 * groups are true nested compounds; edge labels get measured dimensions so ELK
 * reserves space for them and returns exact label boxes.
 */
export async function layoutDiagram(
  spec: DiagramSpec,
  theme: Theme = classicTheme,
): Promise<PositionedSpec> {
  const s = sanitize(spec);
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

  return {
    ...spec,
    edges: s.edges,
    positions,
    groupBoxes,
    zoneBoxes,
    edgeRoutes,
    containedNodeIds: [...s.nodeParent.keys()],
    warnings: s.warnings,
  };
}
