import { createRequire } from "node:module";
import ELK from "elkjs/lib/elk-api.js";
import type { ElkExtendedEdge } from "elkjs/lib/elk-api.js";
import {
  containerTitleBox,
  countTextLines,
  edgeLabelText,
  estimateTextHeight,
  estimateTextWidth,
} from "../measure.js";
import type { DiagramEdge } from "../schema.js";
import type { Theme } from "../theme/index.js";

// TUNABLE spacing (px): between columns/rows of nodes and around edges.
// Bigger = airier diagram, smaller = denser.
const SPACING: Record<string, string> = {
  "elk.layered.spacing.nodeNodeBetweenLayers": "110", // gap between flow layers (arrow length + label corridors live here)
  "elk.layered.spacing.edgeNodeBetweenLayers": "32",
  "elk.spacing.nodeNode": "48", // gap between siblings in the same layer
  "elk.spacing.edgeNode": "32", // how close an edge may run past a node
  "elk.spacing.edgeEdge": "30", // gap between parallel edges (label chips need air)
  "elk.spacing.edgeLabel": "8",
};

// TUNABLE: room inside group/zone boxes; top holds the Medium-20 label row.
// Spacing is repeated here on purpose: ELK reads a compound's interior spacing
// from the compound node itself, not the root, even with INCLUDE_CHILDREN.
// Without it every group fell back to the 20px default (measured: layers
// 120px apart instead of 210 on a 100px-wide node).
export const CONTAINER_OPTIONS = {
  "elk.padding": "[top=56,left=24,bottom=24,right=24]",
  ...SPACING,
};

/**
 * CONTAINER_OPTIONS plus a minimum width that fits the title (renderer draws it
 * at x+14). ELK otherwise sizes a container to its children alone, and 125 of
 * 257 groups across the eval specs had a title spilling past their border.
 *
 * `vertical` works around an upstream bug (elkjs 0.11.1): in a DOWN/UP layout
 * with INCLUDE_CHILDREN, ELK applies a compound node's minimum with width and
 * height swapped, so the width goes in the second slot there.
 * https://github.com/eclipse/elk/issues/1033
 */
export function containerOptions(
  container: { label: string; sublabel?: string },
  theme: Theme,
  vertical: boolean,
): Record<string, string> {
  const title = containerTitleBox(container, theme);
  const width = title.width + 32;
  return {
    ...CONTAINER_OPTIONS,
    // Title band plus the gap to the children; 56 for a one-line title, as in CONTAINER_OPTIONS.
    "elk.padding": `[top=${30 + title.height},left=24,bottom=24,right=24]`,
    "elk.nodeSize.constraints": "MINIMUM_SIZE",
    "elk.nodeSize.minimum": vertical ? `(0, ${width})` : `(${width}, 0)`,
    // A box widened for its title centres its children instead of leaving them
    // against the left padding. Same axis swap in vertical layouts.
    "elk.contentAlignment": vertical ? "V_CENTER" : "H_CENTER",
  };
}

// Shared layered-algorithm options (direction is decided per run).
export const BASE_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.edgeRouting": "ORTHOGONAL",
  ...SPACING,
  // Keep bend points only where an edge actually turns. `true` does the
  // opposite of what the name suggests: it ADDS a bend per long-edge dummy
  // and at every hierarchy crossing. (Measured negative result:
  // `elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX` made routing worse
  // here. Don't re-add.)
  // https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-unnecessaryBendpoints.html
  "elk.layered.unnecessaryBendpoints": "false",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  // Measured negative result: `elk.layered.mergeEdges: true` collapses a hub's
  // spokes onto one shared port, and they then cross each other on approach,
  // 0 -> 15 crossings on an 11-node/10-edge bus. Don't re-add.
  // Edge/section/label coordinates come back relative to the root instead
  // of each edge's containing node, which saves offset bookkeeping below.
  "elk.json.edgeCoords": "ROOT",
};

// The worker script must run in a real Worker: Bun defines `self`, so loading
// it in-process makes it think it's already inside one (registers onmessage,
// exports nothing, never terminates). One persistent worker per process.
export const elk = new ELK({
  workerUrl: createRequire(import.meta.url).resolve("elkjs/lib/elk-worker.min.js"),
});

/** The label chip the renderer draws: text plus a 4px/2px pad. Shared by ELK and the router. */
export function edgeLabelSize(
  edge: DiagramEdge,
  theme: Theme,
): { width: number; height: number } | undefined {
  const text = edgeLabelText(edge);
  if (!text) return undefined;
  return {
    width: estimateTextWidth(text, theme.text.edgeLabel.size, theme.fontFamily) + 8,
    height: estimateTextHeight(theme.text.edgeLabel.size, countTextLines(text)) + 4,
  };
}

/** ELK edge with a measured label box so placement reserves space for it. */
export function elkEdge(edge: DiagramEdge & { id: string }, theme: Theme): ElkExtendedEdge {
  const size = edgeLabelSize(edge, theme);
  return {
    id: edge.id,
    sources: [edge.from],
    targets: [edge.to],
    labels: size
      ? [{ text: edgeLabelText(edge), ...size, layoutOptions: { "elk.edgeLabels.inline": "true" } }]
      : undefined,
  };
}
