/**
 * Visual design tokens for generated diagrams. The LLM decides structure and
 * semantics (categories, container styles, edge kinds); the renderer maps them
 * to these tokens so every diagram comes out consistent. Anything that
 * satisfies `Theme` plugs into layout + renderer — one file per theme in this
 * folder.
 */

export interface ThemeText {
  size: number;
  color: string;
}

export interface CategoryStyle {
  stroke: string;
  fill: string;
}

export interface ContainerStyle {
  stroke: string;
  fill: string;
  strokeStyle: "solid" | "dashed" | "dotted";
  /** Excalidraw fill pattern for the box background. */
  fillStyle?: "solid" | "hachure" | "cross-hatch";
}

export interface Theme {
  id: string;
  /** Excalidraw FONT_FAMILY numeric value (6 = Nunito, 5 = Excalifont). */
  fontFamily: number;
  /** Boxes/containers: 0 = crisp architectural strokes, 1-2 = hand-drawn. */
  roughness: number;
  /**
   * How nodes render. "card": contained nodes get a card box, top-level nodes
   * are boxless solo icons. "icon": every node is a boxless icon; nodes
   * without an icon fall back to a mermaid-style box with centered text.
   */
  nodeMode: "card" | "icon";
  text: {
    containerLabel: ThemeText;
    nodeLabel: ThemeText;
    nodeSublabel: ThemeText;
    soloLabel: ThemeText;
    soloSublabel: ThemeText;
    edgeLabel: ThemeText;
  };
  card: {
    background: string;
    strokeWidth: number;
    minWidth: number;
    paddingX: number;
    iconSize: number;
    padTop: number;
    gapIconLabel: number;
    labelHeight: number;
    sublabelHeight: number;
    padBottom: number;
  };
  /** Boxless nodes (big icon + label underneath). */
  solo: {
    iconSize: number;
    gapIconLabel: number;
    labelHeight: number;
    sublabelHeight: number;
  };
  /** Mermaid-style icon-less node: box with the label centered inside. */
  boxNode: {
    minWidth: number;
    paddingX: number;
    paddingY: number;
    labelHeight: number;
    sublabelHeight: number;
    strokeWidth: number;
  };
  /** Group/zone outline weight. */
  containerStrokeWidth: number;
  /** Keyed by DiagramNode["category"]. */
  categories: Record<string, CategoryStyle>;
  defaultCategory: CategoryStyle;
  /** Keyed by DiagramGroup["style"] and DiagramZone["style"]. */
  containers: Record<string, ContainerStyle>;
  defaultContainer: ContainerStyle;
  /**
   * When set, filled (non-boundary) group boxes cycle through these styles in
   * order so sibling groups get distinct colors instead of one uniform hue.
   */
  containerPalette?: ContainerStyle[];
  edge: {
    stroke: string;
    strokeWidth: number;
    /** Arrows can differ from boxes in sloppiness. */
    roughness: number;
    /** Default arrowhead when the spec doesn't pick one explicitly. */
    arrowhead: "arrow" | "triangle";
    labelBackground: string;
    /** DiagramEdge["kind"] -> Excalidraw strokeStyle. */
    kind: Record<"sync" | "async" | "replication", "solid" | "dashed" | "dotted">;
  };
}
