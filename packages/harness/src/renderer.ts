import type { PositionedSpec } from "./geometry.js";
import { renderContainer } from "./renderer/containers.js";
import { renderEdge } from "./renderer/edges.js";
import { renderBoxNode, renderEntityNode, renderNode, renderSoloNode } from "./renderer/nodes.js";
import type { DiagramEdge } from "./schema.js";
import type { HarnessIconRegistry, RenderResult, RenderSkeleton } from "./skeleton.js";
import { classicTheme, type Theme } from "./theme/index.js";

export type {
  ArrowheadStyle,
  HarnessIconEntry,
  HarnessIconRegistry,
  RenderResult,
  RenderSkeleton,
} from "./skeleton.js";

/**
 * Converts a laid-out DiagramSpec into a framework-agnostic render plan:
 * shape/text/arrow/frame skeletons plus pre-formed raw icon element JSON.
 * Deliberately has zero dependency on `@excalidraw/excalidraw` -- that package
 * can only be imported in a browser context (see apps/web's
 * excalidraw-utils.ts, which does the final skeleton -> element conversion),
 * not here where this runs server-side.
 */
export function renderToExcalidraw(
  positioned: PositionedSpec,
  icons: HarnessIconRegistry,
  theme: Theme = classicTheme,
): RenderResult {
  const skeletons: RenderSkeleton[] = [];
  const rawElements: Record<string, unknown>[] = [];

  for (const zone of positioned.zones ?? []) {
    const box = positioned.zoneBoxes[zone.id];
    if (!box) continue;
    renderContainer(`zone-${zone.id}`, zone.label, undefined, zone.style, box, theme, skeletons);
  }

  // Sibling groups cycle through the theme's palette (when it has one) so
  // adjacent boxes get distinct colors. Boundary-style containers (dashed,
  // transparent) keep their semantic look and don't consume a palette slot.
  const palette = theme.containerPalette;
  let paletteIndex = 0;
  for (const group of positioned.groups ?? []) {
    const box = positioned.groupBoxes[group.id];
    if (!box) continue;
    const base = theme.containers[group.style ?? ""] ?? theme.defaultContainer;
    const paletteTokens =
      palette && palette.length > 0 && base.fill !== "transparent"
        ? palette[paletteIndex++ % palette.length]
        : undefined;
    renderContainer(
      `group-${group.id}`,
      group.label,
      group.sublabel,
      group.style,
      box,
      theme,
      skeletons,
      { strokeColor: group.strokeColor, backgroundColor: group.backgroundColor },
      paletteTokens,
    );
  }

  const contained = new Set(positioned.containedNodeIds);
  for (const node of positioned.nodes) {
    const box = positioned.positions[node.id];
    if (!box) continue;
    if (node.columns && node.columns.length > 0) {
      // ERD entity tables look the same in every theme (roughness aside).
      renderEntityNode(node, box, theme, skeletons);
    } else if (theme.nodeMode === "icon") {
      // Handdrawn: never a card. Icon nodes stand alone; icon-less nodes get
      // a mermaid-style box. Must mirror the branch in measure.ts nodeSize.
      if (node.icon) {
        renderSoloNode(node, box, icons, theme, skeletons, rawElements);
      } else {
        renderBoxNode(node, box, theme, skeletons);
      }
    } else if (contained.has(node.id)) {
      renderNode(node, box, icons, theme, skeletons, rawElements);
    } else {
      renderSoloNode(node, box, icons, theme, skeletons, rawElements);
    }
  }

  for (const edge of positioned.edges as (DiagramEdge & { id: string })[]) {
    const route = positioned.edgeRoutes[edge.id];
    if (!route) continue;
    renderEdge(edge, route, theme, skeletons);
  }

  // Wrap the whole diagram in a named frame: one-click select/move/export,
  // and the anchor for "replace this diagram" updates.
  skeletons.push({
    kind: "frame",
    id: `frame-${crypto.randomUUID()}`,
    name: positioned.title,
    children: [...skeletons.map((s) => s.id), ...rawElements.map((el) => el.id as string)],
  });

  return { skeletons, rawElements };
}
