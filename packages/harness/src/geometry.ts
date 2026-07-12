import type { DiagramSpec } from "./schema.js";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeRoute {
  /** Absolute orthogonal polyline: start, bends, end. */
  points: { x: number; y: number }[];
  /** Absolute box ELK reserved for the edge label, if any. */
  label?: Box;
}

export interface PositionedSpec extends DiagramSpec {
  positions: Record<string, Box>;
  groupBoxes: Record<string, Box>;
  zoneBoxes: Record<string, Box>;
  /** Keyed by edge id — layout assigns ids to edges that lack one. */
  edgeRoutes: Record<string, EdgeRoute>;
  /**
   * Nodes that live inside a group/zone. The renderer draws these as cards;
   * top-level nodes render as boxless solo icons. Exported so renderer and
   * layout agree even when sanitization dropped a malformed container.
   */
  containedNodeIds: string[];
  warnings: string[];
}
