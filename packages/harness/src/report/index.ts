import type { PositionedSpec } from "../geometry.js";
import { computeMetrics, type Metrics } from "./metrics.js";

export type { Metrics, Offenders } from "./metrics.js";

export type DiagnosticCode =
  | "UNROUTED_EDGE"
  | "NODE_OVERLAP"
  | "EDGE_THROUGH_NODE"
  | "LABEL_COLLISION"
  | "EDGE_CROSSING"
  | "DUPLICATE_LABEL"
  | "BACK_EDGE"
  | "EXTREME_ASPECT"
  | "BEND_HEAVY";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: "error" | "warn";
  /** Spec ids (edge or node), never pixels -- the model reasons in these. */
  subjects: string[];
  message: string;
}

export interface DiagramReport {
  /** 0-100. 100 is a clean layout; see PENALTY for what costs what. */
  score: number;
  metrics: Metrics;
  diagnostics: Diagnostic[];
}

/**
 * Score cost per occurrence. Ordering reflects the graph-drawing literature:
 * crossings dominate readability, an edge through a node reads as broken, and
 * bends are a mild tax. Aspect is scored as a band, not per-unit.
 *
 * These are tuned against the fixture corpus in test/. Changing one changes
 * which candidate layout `layoutDiagram` picks -- re-baseline when you do.
 * https://www2.cs.arizona.edu/~kobourov/gd-metrics2024.pdf
 */
const PENALTY = {
  unrouted: 25,
  nodeOverlap: 20,
  edgeThroughNode: 12,
  labelCollision: 8,
  crossing: 6,
  duplicateLabel: 5,
  backEdge: 3,
} as const;

// Wider or taller than this stops fitting a slide or a README image.
const ASPECT_MIN = 0.5;
const ASPECT_MAX = 2.6;

// Below this the layout has no freedom to reshape -- two nodes side by side are
// necessarily wide, and charging them for it makes every small diagram look
// broken. Only score aspect once there is a choice to get wrong.
const ASPECT_MIN_NODES = 5;

/** Bends per edge above which a diagram reads as stair-steppy rather than routed. */
const BENDS_PER_EDGE_BUDGET = 1.5;

function aspectPenalty(aspect: number): number {
  if (aspect >= ASPECT_MIN && aspect <= ASPECT_MAX) return 0;
  const excess = aspect > ASPECT_MAX ? aspect / ASPECT_MAX : ASPECT_MIN / aspect;
  return Math.min(25, Math.round(Math.log2(excess) * 20));
}

function bendPenalty(metrics: Metrics): number {
  if (metrics.edges === 0) return 0;
  const excess = metrics.bends / metrics.edges - BENDS_PER_EDGE_BUDGET;
  return excess <= 0 ? 0 : Math.min(15, Math.round(excess * metrics.edges * 1.5));
}

/**
 * Grades a laid-out spec. Deterministic and geometry-only: same input, same
 * report, no model and no screenshot. Use it to gate output, to pick between
 * candidate layouts, and as the regression signal for layout changes.
 */
export function buildReport(spec: PositionedSpec): DiagramReport {
  const metrics = computeMetrics(spec);
  const o = metrics.offenders;
  const diagnostics: Diagnostic[] = [];

  for (const edge of o.unrouted) {
    diagnostics.push({
      code: "UNROUTED_EDGE",
      severity: "error",
      subjects: [edge],
      message: "Edge has no route; layout dropped it.",
    });
  }
  for (const [a, b] of o.nodeOverlap) {
    diagnostics.push({
      code: "NODE_OVERLAP",
      severity: "error",
      subjects: [a, b],
      message: `Nodes ${a} and ${b} overlap.`,
    });
  }
  for (const { edge, node } of o.edgeThroughNode) {
    diagnostics.push({
      code: "EDGE_THROUGH_NODE",
      severity: "error",
      subjects: [edge, node],
      message: `Edge ${edge} passes through node ${node}.`,
    });
  }
  for (const edge of o.labelCollision) {
    diagnostics.push({
      code: "LABEL_COLLISION",
      severity: "warn",
      subjects: [edge],
      message: `Label of ${edge} overlaps a node or another label.`,
    });
  }
  for (const { text, edges } of o.duplicateLabel) {
    diagnostics.push({
      code: "DUPLICATE_LABEL",
      severity: "warn",
      subjects: edges,
      message: `${edges.length} edges all labelled "${text}"; label only what differs.`,
    });
  }
  for (const [a, b] of o.crossing) {
    diagnostics.push({
      code: "EDGE_CROSSING",
      severity: "warn",
      subjects: [a, b],
      message: `Edges ${a} and ${b} cross.`,
    });
  }
  for (const edge of o.backEdge) {
    diagnostics.push({
      code: "BACK_EDGE",
      severity: "warn",
      subjects: [edge],
      message: `Edge ${edge} runs against the diagram's flow direction.`,
    });
  }

  const nodeCount = Object.keys(spec.positions).length;
  const aspectCost = nodeCount >= ASPECT_MIN_NODES ? aspectPenalty(metrics.aspect) : 0;
  if (aspectCost > 0) {
    diagnostics.push({
      code: "EXTREME_ASPECT",
      severity: "warn",
      subjects: [],
      message: `Canvas aspect ${metrics.aspect.toFixed(2)}:1 is outside ${ASPECT_MIN}-${ASPECT_MAX}.`,
    });
  }
  const bendCost = bendPenalty(metrics);
  if (bendCost > 0) {
    diagnostics.push({
      code: "BEND_HEAVY",
      severity: "warn",
      subjects: [],
      message: `${metrics.bends} bends across ${metrics.edges} edges.`,
    });
  }

  const cost =
    metrics.unrouted * PENALTY.unrouted +
    metrics.nodeOverlaps * PENALTY.nodeOverlap +
    metrics.edgeThroughNode * PENALTY.edgeThroughNode +
    metrics.labelCollisions * PENALTY.labelCollision +
    metrics.crossings * PENALTY.crossing +
    metrics.duplicateLabels * PENALTY.duplicateLabel +
    metrics.backEdges * PENALTY.backEdge +
    aspectCost +
    bendCost;

  // Severity-first so a caller can truncate the list and still see what matters.
  diagnostics.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));

  return { score: Math.max(0, 100 - cost), metrics, diagnostics };
}
