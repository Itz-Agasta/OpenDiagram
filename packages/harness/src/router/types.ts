import type { Box } from "../geometry.js";

export type Point = { x: number; y: number };
export type Face = "top" | "right" | "bottom" | "left";
/** Unit step along a face's outward normal. */
export const NORMAL: Record<Face, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
export const FACES: Face[] = ["top", "right", "bottom", "left"];

export interface RouterNode extends Box {
  id: string;
  /** Innermost container, if any. */
  parent?: string;
  /**
   * Where edges attach, when not the whole box: a boxless icon node attaches
   * to its icon (top of the box); its caption below still blocks routes.
   */
  anchor?: Box;
}

/** The box a face's ports sit on. The bottom face stays under the caption. */
export function faceBox(node: RouterNode, face: Face): Box {
  const a = node.anchor;
  if (!a) return node;
  if (face === "bottom") return { x: a.x, y: node.y, width: a.width, height: node.height };
  return a;
}

export interface RouterContainer extends Box {
  id: string;
  parent?: string;
  /** Title band, absolute. Never crossed, not even by the container's own members. */
  title?: Box;
}

export interface RouterEdge {
  id: string;
  from: string;
  to: string;
  /** Measured label chip; the router picks where it lands. */
  label?: { width: number; height: number };
}

export interface RouterInput {
  nodes: RouterNode[];
  containers: RouterContainer[];
  edges: RouterEdge[];
  /** Main flow axis; biases which faces edges prefer. */
  direction: "LR" | "RL" | "TB" | "BT";
}

/** One endpoint pinned to a face; `at` is the coordinate along the face. */
export interface Port {
  node: string;
  face: Face;
  at: number;
}
