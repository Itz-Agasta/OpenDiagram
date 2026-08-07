import { createRequire } from "node:module";
import ELK from "elkjs/lib/elk-api.js";
import type { ElkExtendedEdge } from "elkjs/lib/elk-api.js";
import {
  countTextLines,
  edgeLabelText,
  estimateTextHeight,
  estimateTextWidth,
} from "../measure.js";
import type { DiagramEdge } from "../schema.js";
import type { Theme } from "../theme/index.js";

// TUNABLE: room inside group/zone boxes; top holds the Medium-20 label row.
export const CONTAINER_OPTIONS = { "elk.padding": "[top=56,left=24,bottom=24,right=24]" };

// Shared layered-algorithm options (direction is decided per run).
export const BASE_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
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
  // Keep bend points only where an edge actually turns. `true` does the
  // opposite of what the name suggests -- it ADDS a bend per long-edge dummy
  // and at every hierarchy crossing. (Measured negative result:
  // `elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX` made routing worse
  // here. Don't re-add.)
  // https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-unnecessaryBendpoints.html
  "elk.layered.unnecessaryBendpoints": "false",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  // Measured negative result: `elk.layered.mergeEdges: true` collapses a hub's
  // spokes onto one shared port, and they then cross each other on approach --
  // 0 -> 15 crossings on an 11-node/10-edge bus. Don't re-add.
  // Edge/section/label coordinates come back relative to the root instead
  // of each edge's containing node -- saves offset bookkeeping below.
  "elk.json.edgeCoords": "ROOT",
};

// The worker script must run in a real Worker: Bun defines `self`, so loading
// it in-process makes it think it's already inside one (registers onmessage,
// exports nothing, never terminates). One persistent worker per process.
export const elk = new ELK({
  workerUrl: createRequire(import.meta.url).resolve("elkjs/lib/elk-worker.min.js"),
});

/** ELK edge with a measured label box so layout reserves space for it. */
export function elkEdge(edge: DiagramEdge & { id: string }, theme: Theme): ElkExtendedEdge {
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
}
