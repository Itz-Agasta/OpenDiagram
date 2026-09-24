import type { Box, EdgeRoute } from "../geometry.js";
import { containerTitleBox } from "../measure.js";
import { type RouterContainer, type RouterInput, routeEdges } from "../router/index.js";
import type { DiagramSpec } from "../schema.js";
import type { Theme } from "../theme/index.js";
import { edgeLabelSize } from "./elk-common.js";
import type { LayoutGeometry } from "./macro.js";
import type { Sanitized } from "./sanitize.js";

const round = (b: Box): Box => ({
  x: Math.round(b.x),
  y: Math.round(b.y),
  width: Math.round(b.width),
  height: Math.round(b.height),
});

/**
 * Routes every sanitized edge over placed geometry. Title bands are measured
 * the way `renderer/containers.ts` draws them (label + sublabel, top-left), so
 * no route or label chip lands on a container's name.
 */
export function routeGeometry(
  spec: DiagramSpec,
  s: Sanitized,
  geo: LayoutGeometry,
  theme: Theme,
): { routes: Record<string, EdgeRoute>; warnings: string[] } {
  const zoneOf = new Map<string, string>();
  for (const z of s.zones) for (const id of z.contains) zoneOf.set(id, z.id);
  const labelled = new Map<string, { label: string; sublabel?: string }>();
  for (const c of [...(spec.zones ?? []), ...(spec.groups ?? [])]) labelled.set(c.id, c);

  const containers: RouterContainer[] = [];
  const add = (id: string, box: Box) => {
    const title = containerTitleBox(labelled.get(id) ?? { label: "" }, theme);
    const b = round(box);
    containers.push({
      id,
      ...b,
      parent: zoneOf.get(id),
      title: {
        x: b.x + 8,
        y: b.y + 6,
        // Not capped at the box: a long title the renderer draws past the
        // border must still keep routes and chips off it.
        width: title.width + 16,
        height: title.height + 12,
      },
    });
  };
  for (const [id, box] of Object.entries(geo.zoneBoxes)) add(id, box);
  for (const [id, box] of Object.entries(geo.groupBoxes)) add(id, box);

  // Mirrors the branch in renderer.ts: these nodes draw as a bare icon with a
  // caption under it, so edges attach to the icon, not the caption-wide box.
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const solo = (id: string) => {
    const n = byId.get(id);
    if (!n || n.columns?.length) return false;
    return theme.nodeMode === "icon" ? Boolean(n.icon) : !s.nodeParent.has(id);
  };
  const icon = theme.solo.iconSize;
  const input: RouterInput = {
    nodes: Object.entries(geo.positions).map(([id, box]) => {
      const b = round(box);
      const anchor = solo(id)
        ? { x: Math.round(b.x + (b.width - icon) / 2), y: b.y, width: icon, height: icon }
        : undefined;
      return { id, ...b, parent: s.nodeParent.get(id), anchor };
    }),
    containers,
    edges: s.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      label: edgeLabelSize(e, theme),
    })),
    direction: spec.meta?.direction ?? (spec.type === "erd" ? "TB" : "LR"),
  };
  const { routes, fallbacks } = routeEdges(input);
  return {
    routes,
    warnings: fallbacks.map(
      (id) => `edge "${id}" could not be routed cleanly - drawn as a direct elbow`,
    ),
  };
}
