/**
 * Framework-agnostic render plan types. The renderer emits these; apps/web's
 * excalidraw-utils converts them to real Excalidraw elements in the browser.
 * Kept dependency-free so every harness module can import them.
 */

export interface HarnessIconEntry {
  id: string;
  elements: readonly Record<string, unknown>[];
}

export type HarnessIconRegistry = Record<string, HarnessIconEntry>;

/** Subset of Excalidraw's Arrowhead union the harness emits. */
export type ArrowheadStyle =
  | "none"
  | "arrow"
  | "triangle"
  | "circle"
  | "bar"
  | "crowfoot_one"
  | "crowfoot_many"
  | "crowfoot_one_or_many";

export type RenderSkeleton =
  | {
      kind: "container";
      id: string;
      shape: "rectangle" | "ellipse" | "diamond";
      x: number;
      y: number;
      width: number;
      height: number;
      strokeColor?: string;
      backgroundColor?: string;
      strokeStyle?: "solid" | "dashed" | "dotted";
      /** Excalidraw fill pattern — defaults to "solid" when omitted. */
      fillStyle?: "solid" | "hachure" | "cross-hatch";
      strokeWidth?: number;
      rounded?: boolean;
      roughness?: number;
      opacity?: number;
      groupId?: string;
    }
  | {
      kind: "text";
      id: string;
      text: string;
      /** With textAlign "center", x is the anchor the text is centered on. */
      x: number;
      y: number;
      fontSize: number;
      fontFamily?: number;
      color?: string;
      textAlign?: "left" | "center" | "right";
      groupId?: string;
    }
  | {
      kind: "arrow";
      id: string;
      x: number;
      y: number;
      /** Polyline relative to (x, y) — first point is [0, 0]. */
      points: [number, number][];
      startId?: string;
      endId?: string;
      strokeColor?: string;
      strokeStyle?: "solid" | "dashed" | "dotted";
      strokeWidth?: number;
      roughness?: number;
      startArrowhead: ArrowheadStyle;
      endArrowhead: ArrowheadStyle;
      groupId?: string;
    }
  | {
      kind: "frame";
      id: string;
      name: string;
      children: string[];
    };

export interface RenderResult {
  skeletons: RenderSkeleton[];
  rawElements: Record<string, unknown>[];
}
