/**
 * Visual design tokens for generated diagrams. The LLM decides structure and
 * semantics (categories, container styles, edge kinds); the renderer maps them
 * to these tokens so every diagram comes out consistent.
 *
 * TODO: additional user-selectable themes (hand-drawn, aws-orange,
 * dark) -- anything that satisfies `Theme` plugs into layout + renderer.
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
}

export interface Theme {
  id: string;
  /** Excalidraw FONT_FAMILY numeric value (6 = Nunito, 5 = Excalifont). */
  fontFamily: number;
  /** 0 = crisp architectural strokes, 1-2 = hand-drawn. */
  roughness: number;
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
  /** Boxless nodes (top-level actors/externals): big icon + label underneath. */
  solo: {
    iconSize: number;
    gapIconLabel: number;
    labelHeight: number;
    sublabelHeight: number;
  };
  /** Keyed by DiagramNode["category"]. */
  categories: Record<string, CategoryStyle>;
  defaultCategory: CategoryStyle;
  /** Keyed by DiagramGroup["style"] and DiagramZone["style"]. */
  containers: Record<string, ContainerStyle>;
  defaultContainer: ContainerStyle;
  edge: {
    stroke: string;
    strokeWidth: number;
    labelBackground: string;
    /** DiagramEdge["kind"] -> Excalidraw strokeStyle. */
    kind: Record<"sync" | "async" | "replication", "solid" | "dashed" | "dotted">;
  };
}

const boundary: ContainerStyle = { stroke: "#64748b", fill: "transparent", strokeStyle: "dashed" };
const tier: ContainerStyle = { stroke: "#94a3b8", fill: "#f8fafc", strokeStyle: "solid" };
const cluster: ContainerStyle = { stroke: "#15803d", fill: "#f0fdf4", strokeStyle: "solid" };

// ────────────────────────────────────────────────────────────────────────────
// TUNABLES — every number below is safe to play with. Layout re-measures from
// these tokens, so bumping a size automatically makes room for it. Font sizes
// track Excalidraw's presets (Small 16, Medium 20, Large 28).
// After editing: RESTART dev:server (bun --hot does not reload this package).
// ────────────────────────────────────────────────────────────────────────────
export const defaultTheme: Theme = {
  id: "clean",
  fontFamily: 6, // 6 = Nunito ("Normal"), 5 = Excalifont (hand-drawn), 2 = Helvetica
  roughness: 0, // 0 = crisp architect lines, 1-2 = sketchy hand-drawn
  text: {
    containerLabel: { size: 20, color: "#475569" }, // group/zone titles ("AWS VPC")
    nodeLabel: { size: 16, color: "#1e293b" }, // card node name
    nodeSublabel: { size: 13, color: "#64748b" }, // card tech detail ("RDS Aurora")
    soloLabel: { size: 20, color: "#1e293b" }, // boxless node name ("Web User")
    soloSublabel: { size: 16, color: "#64748b" }, // boxless tech detail
    edgeLabel: { size: 14, color: "#475569" }, // arrow labels
  },
  card: {
    background: "#ffffff",
    strokeWidth: 1,
    minWidth: 170, // narrowest a card can be
    paddingX: 18, // left/right air between text and card border
    iconSize: 48, // icon inside a card
    padTop: 14, // air above the icon
    gapIconLabel: 10, // air between icon and label
    labelHeight: 22, // vertical band reserved for the label row
    sublabelHeight: 17, // vertical band reserved for the sublabel row
    padBottom: 12, // air under the text
  },
  solo: {
    iconSize: 80, // boxless icon (user/CDN/external) -- the "hero" size
    gapIconLabel: 10,
    labelHeight: 26,
    sublabelHeight: 20,
  },
  categories: {
    service: { stroke: "#1d4ed8", fill: "#eff6ff" },
    function: { stroke: "#1d4ed8", fill: "#eff6ff" },
    database: { stroke: "#15803d", fill: "#f0fdf4" },
    storage: { stroke: "#15803d", fill: "#f0fdf4" },
    queue: { stroke: "#b45309", fill: "#fffbeb" },
    gateway: { stroke: "#c2410c", fill: "#fff7ed" },
    cache: { stroke: "#7c3aed", fill: "#f5f3ff" },
    client: { stroke: "#334155", fill: "#f8fafc" },
    user: { stroke: "#334155", fill: "#f8fafc" },
    external: { stroke: "#64748b", fill: "#f1f5f9" },
  },
  defaultCategory: { stroke: "#334155", fill: "#f8fafc" },
  containers: {
    vpc: cluster,
    cluster,
    subnet: tier,
    box: tier,
    swimlane: tier,
    region: boundary,
    "aws-region": boundary,
    "gcp-region": boundary,
    "availability-zone": boundary,
    boundary,
  },
  defaultContainer: tier,
  edge: {
    stroke: "#475569",
    strokeWidth: 1,
    labelBackground: "#ffffff",
    kind: { sync: "solid", async: "dashed", replication: "dotted" },
  },
};
