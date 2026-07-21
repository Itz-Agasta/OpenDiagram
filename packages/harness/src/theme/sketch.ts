import { categories, classicTheme } from "./classic.js";
import type { ContainerStyle, Theme } from "./types.js";

// Sketch containers: Excalidraw's stock stroke/background palette with
// hachure fill — the classic whiteboard-sketch look.
const sketchBoundary: ContainerStyle = {
  stroke: "#1e1e1e",
  fill: "transparent",
  strokeStyle: "dashed",
};
const sketchTier: ContainerStyle = {
  stroke: "#1971c2",
  fill: "#a5d8ff",
  strokeStyle: "solid",
  fillStyle: "hachure",
};
const sketchCluster: ContainerStyle = {
  stroke: "#2f9e44",
  fill: "#b2f2bb",
  strokeStyle: "solid",
  fillStyle: "hachure",
};
const sketchAmber: ContainerStyle = {
  stroke: "#f08c00",
  fill: "#ffec99",
  strokeStyle: "solid",
  fillStyle: "hachure",
};
const sketchRose: ContainerStyle = {
  stroke: "#e03131",
  fill: "#ffc9c9",
  strokeStyle: "solid",
  fillStyle: "hachure",
};

// ────────────────────────────────────────────────────────────────────────────
// TUNABLES -- same rules as classic.ts: every number is safe to play with.
// After editing: RESTART dev:server (bun --hot does not reload this package).
// ────────────────────────────────────────────────────────────────────────────
// Sketch: no cards at all -- every icon stands alone; icon-less nodes get a
// mermaid-style box. Everything sketchy (roughness 1 "artist", width 2
// "bold"); arrows follow ELK's route with plain "arrow" heads.
export const sketchTheme: Theme = {
  id: "sketch",
  fontFamily: 5, // Excalifont — the hand-drawn look
  roughness: 1, // "artist" sloppiness for boxes/containers
  nodeMode: "icon",
  text: {
    containerLabel: { size: 20, color: "#475569" },
    nodeLabel: { size: 20, color: "#1e293b" }, // mermaid-box text — Medium
    nodeSublabel: { size: 16, color: "#64748b" },
    soloLabel: { size: 20, color: "#1e293b" }, // under-icon text — Medium
    soloSublabel: { size: 16, color: "#64748b" },
    edgeLabel: { size: 16, color: "#475569" }, // arrow labels — Small
  },
  card: classicTheme.card, // unused in "icon" mode, kept for Theme shape
  solo: {
    iconSize: 88, // a touch bigger than classic's solo icons
    gapIconLabel: 10,
    labelHeight: 26,
    sublabelHeight: 20,
  },
  entity: {
    minWidth: 210,
    paddingX: 16,
    headerHeight: 40,
    rowHeight: 30, // Excalifont is taller/wider — roomier rows
    fontSize: 16,
    padBottom: 10,
  },
  boxNode: {
    minWidth: 150,
    paddingX: 22,
    paddingY: 18,
    labelHeight: 26,
    sublabelHeight: 20,
    strokeWidth: 2, // "bold" — Excalidraw's 2nd stroke width
    fillStyle: "hachure", // sketchy fill, matching the containers
  },
  containerStrokeWidth: 2,
  categories,
  defaultCategory: { stroke: "#334155", fill: "#f8fafc" },
  containers: {
    vpc: sketchCluster,
    cluster: sketchCluster,
    subnet: sketchTier,
    box: sketchTier,
    swimlane: sketchTier,
    region: sketchBoundary,
    "aws-region": sketchBoundary,
    "gcp-region": sketchBoundary,
    "availability-zone": sketchBoundary,
    boundary: sketchBoundary,
  },
  defaultContainer: sketchTier,
  // Sibling groups rotate through Excalidraw's stock palette so "Frontend /
  // Backend / Data" boxes don't all come out the same blue.
  containerPalette: [sketchTier, sketchCluster, sketchAmber, sketchRose],
  edge: {
    stroke: "#475569",
    strokeWidth: 2, // bold arrows
    roughness: 1, // artist — sketchy like the boxes
    arrowhead: "arrow",
    labelBackground: "#ffffff",
    errorStroke: "#e03131", // Excalidraw's stock red
    successStroke: "#2f9e44", // Excalidraw's stock green
    kind: {
      sync: "solid",
      async: "dashed",
      replication: "dotted",
      error: "dashed",
      success: "dashed",
    },
  },
};
