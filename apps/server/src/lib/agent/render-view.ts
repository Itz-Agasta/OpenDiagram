import {
  buildReport,
  layoutDiagram,
  renderSequenceDiagram,
  renderToExcalidraw,
  type DiagramSpec,
  type PositionedSpec,
  type RenderSkeleton,
  type Theme,
} from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/server";
import { iconRegistry, normalizeSpecIcons } from "../icons/registry";
import type { FixEvent, FixStats, LayoutFixer } from "./fix";

export interface DrawDiagramOutput {
  skeletons: RenderSkeleton[];
  rawElements: Record<string, unknown>[];
  summary: {
    title: string;
    nodes: number;
    edges: number;
    warnings: string[];
  };
  /**
   * Set only while a layout fixer is on. `polishing`: this is the first draw,
   * a preliminary result, and a fixed one may follow. `done`: final; `changed`
   * false means the canvas already shows it.
   */
  fix?: { status: "polishing" } | { status: "done"; changed: boolean };
}

export type RenderedView = DrawDiagramOutput & {
  /** The icon-normalized spec, the one the client stores for CANVAS. */
  spec: DiagramSpec;
  logFields: Record<string, unknown>;
  /** What the fixer starts from. Absent for sequence diagrams, which it skips. */
  positioned?: PositionedSpec;
};

/**
 * One spec to canvas payload: icons, layout (sequence grid or ELK), render,
 * report. Shared by `draw_diagram` and every view `draw_system` plans. The
 * layout fixer, when on, runs after this through `polishView`, so the first
 * draw can reach the canvas while it works.
 */
export async function renderView(rawSpec: DiagramSpec, theme: Theme): Promise<RenderedView> {
  const normalized = normalizeSpecIcons<DiagramSpec>(rawSpec);
  const spec = normalized.spec;
  const warnings = normalized.unknownIcons.map((key) => `unknown icon "${key}" - drawn as a box`);
  // Sequence diagrams skip the report: its metrics assume ELK routes, and a
  // lifeline grid crosses its own messages by construction.
  if (spec.type === "sequence") {
    const result = renderSequenceDiagram(spec, theme);
    warnings.push(...result.warnings);
    return output(spec, result, spec.edges.length, warnings);
  }
  return drawn(spec, await layoutDiagram(spec, theme), theme, warnings);
}

/**
 * The fixer's pass over a first draw, plus what it did for the log. Hands back
 * the same `view` object when the drawing did not change, so callers can tell
 * by identity.
 */
export async function polishView(
  view: RenderedView,
  theme: Theme,
  fix: LayoutFixer,
  onEvent: (event: FixEvent) => void,
  part?: Parameters<LayoutFixer>[3],
): Promise<{ view: RenderedView; stats?: FixStats }> {
  if (!view.positioned) return { view };
  // The fixer may restructure (merge edges, add a junction): what it returns
  // is what the canvas stores, so the next edit starts from what is drawn.
  const { spec, positioned, stats } = await fix(view.spec, view.positioned, onEvent, part);
  if (positioned === view.positioned) return { view, stats };
  // Icon warnings carry over; layout warnings come from the new positioning.
  const iconWarnings = view.summary.warnings.filter((w) => w.startsWith("unknown icon"));
  return { view: drawn(spec, positioned, theme, iconWarnings), stats };
}

function drawn(
  spec: DiagramSpec,
  positioned: PositionedSpec,
  theme: Theme,
  warnings: string[],
): RenderedView {
  const result = renderToExcalidraw(positioned, iconRegistry, theme);
  // Post-sanitize count, matching what actually renders on canvas.
  const view = output(spec, result, positioned.edges.length, [...warnings, ...positioned.warnings]);
  const report = buildReport(positioned);
  view.logFields = {
    ...view.logFields,
    score: report.score,
    metrics: report.metrics,
    diagnostics: report.diagnostics.map((d) => `${d.code}:${d.subjects.join(",")}`),
  };
  return { ...view, positioned };
}

function output(
  spec: DiagramSpec,
  {
    skeletons,
    rawElements,
  }: { skeletons: RenderSkeleton[]; rawElements: Record<string, unknown>[] },
  edgeCount: number,
  warnings: string[],
): RenderedView {
  return {
    spec,
    skeletons,
    rawElements,
    summary: { title: spec.title, nodes: spec.nodes.length, edges: edgeCount, warnings },
    logFields: {
      title: spec.title,
      diagramType: spec.type,
      nodeCount: spec.nodes.length,
      edgeCount,
      elementCount: skeletons.length + rawElements.length,
      // Off unless LOG_DIAGRAM_SPEC is set. The spec is how a bad diagram
      // gets replayed into the harness corpus and counts alone are not
      // reproducible, but wide events reach Sentry and this is the user's
      // architecture. Turn it on locally to harvest fixtures, never in a
      // deployment serving anyone else.
      ...(env.LOG_DIAGRAM_SPEC && { spec: JSON.stringify(spec) }),
    },
  };
}
