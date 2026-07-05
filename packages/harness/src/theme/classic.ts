import type { ContainerStyle, Theme } from "./types.js";

const boundary: ContainerStyle = { stroke: "#64748b", fill: "transparent", strokeStyle: "dashed" };
const tier: ContainerStyle = { stroke: "#94a3b8", fill: "#f8fafc", strokeStyle: "solid" };
const cluster: ContainerStyle = { stroke: "#15803d", fill: "#f0fdf4", strokeStyle: "solid" };

/** Node category palette shared by themes that don't define their own. */
export const categories: Theme["categories"] = {
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
};

// Layout re-measures from these tokens, so bumping a size automatically makes room for it.
// Font sizes track Excalidraw's presets (Small 16, Medium 20, Large 28).
export const classicTheme: Theme = {
  id: "classic",
  fontFamily: 6, // 6 = Nunito ("Normal"), 5 = Excalifont (hand-drawn), 2 = Helvetica
  roughness: 0, // 0 = crisp architect lines, 1-2 = sketchy hand-drawn
  nodeMode: "card",
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
  boxNode: {
    minWidth: 140,
    paddingX: 20,
    paddingY: 16,
    labelHeight: 22,
    sublabelHeight: 17,
    strokeWidth: 1,
  },
  containerStrokeWidth: 1,
  categories,
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
    roughness: 0,
    arrowhead: "triangle",
    labelBackground: "#ffffff",
    kind: { sync: "solid", async: "dashed", replication: "dotted" },
  },
};
