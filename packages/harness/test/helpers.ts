import type { Box, PositionedSpec, RenderSkeleton } from "../src/index.js";
import type { Face } from "../src/router/types.js";

type Point = { x: number; y: number };

/** Guards against NaN/Infinity leaking into coordinates, the failure mode that renders nothing. */
export function allFinite(skeletons: RenderSkeleton[]): boolean {
  return skeletons.every((s) => {
    const nums = Object.values(s).filter((v): v is number => typeof v === "number");
    const pts = s.kind === "arrow" ? s.points.flat() : [];
    return [...nums, ...pts].every((n) => Number.isFinite(n));
  });
}

export const centreX = (b: Box): number => b.x + b.width / 2;

/** A drawing built by hand: every box exactly where the test says, no layout run. */
export function positioned(
  parts: Partial<PositionedSpec> & Pick<PositionedSpec, "positions">,
): PositionedSpec {
  return {
    type: "system-design",
    title: "t",
    nodes: Object.keys(parts.positions).map((id) => ({ id, label: id, category: "service" })),
    edges: [],
    groupBoxes: {},
    zoneBoxes: {},
    edgeRoutes: {},
    containedNodeIds: [],
    warnings: [],
    ...parts,
  };
}

/**
 * The point lies on that side of the box. Default `tol` covers the router's
 * binding gap: endpoints stop 4px inside the face (same inset as `metrics.ts`).
 */
export function onFace(p: Point, b: Box, face: Face, tol = 5): boolean {
  const inX = b.x - tol <= p.x && p.x <= b.x + b.width + tol;
  const inY = b.y - tol <= p.y && p.y <= b.y + b.height + tol;
  if (face === "top") return inX && Math.abs(p.y - b.y) <= tol;
  if (face === "bottom") return inX && Math.abs(p.y - (b.y + b.height)) <= tol;
  if (face === "left") return inY && Math.abs(p.x - b.x) <= tol;
  return inY && Math.abs(p.x - (b.x + b.width)) <= tol;
}
