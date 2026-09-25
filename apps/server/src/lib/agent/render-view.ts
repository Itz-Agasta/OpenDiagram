import {
  buildReport,
  layoutDiagram,
  renderSequenceDiagram,
  renderToExcalidraw,
  type DiagramReport,
  type DiagramSpec,
  type RenderSkeleton,
  type Theme,
} from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/server";
import { iconRegistry, normalizeSpecIcons } from "../icons/registry";

export interface DrawDiagramOutput {
  skeletons: RenderSkeleton[];
  rawElements: Record<string, unknown>[];
  summary: {
    title: string;
    nodes: number;
    edges: number;
    warnings: string[];
  };
}

/**
 * One spec to canvas payload: icons, layout (sequence grid or ELK), render,
 * report. Shared by `draw_diagram` and every view `draw_system` plans.
 * `spec` is the icon-normalized spec, the one the client stores for CANVAS.
 */
export async function renderView(
  rawSpec: DiagramSpec,
  theme: Theme,
): Promise<DrawDiagramOutput & { spec: DiagramSpec; logFields: Record<string, unknown> }> {
  const { spec, unknownIcons } = normalizeSpecIcons<DiagramSpec>(rawSpec);
  const warnings = unknownIcons.map((key) => `unknown icon "${key}" - drawn as a box`);

  let skeletons: RenderSkeleton[];
  let rawElements: Record<string, unknown>[];
  let edgeCount = spec.edges.length;
  // Sequence diagrams skip the report: its metrics assume ELK routes, and a
  // lifeline grid crosses its own messages by construction.
  let report: DiagramReport | undefined;
  if (spec.type === "sequence") {
    const result = renderSequenceDiagram(spec, theme);
    skeletons = result.skeletons;
    rawElements = result.rawElements;
    warnings.push(...result.warnings);
  } else {
    const positioned = await layoutDiagram(spec, theme);
    const result = renderToExcalidraw(positioned, iconRegistry, theme);
    skeletons = result.skeletons;
    rawElements = result.rawElements;
    warnings.push(...positioned.warnings);
    // Post-sanitize count, matching what actually renders on canvas.
    edgeCount = positioned.edges.length;
    report = buildReport(positioned);
  }

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
      ...(report && {
        score: report.score,
        metrics: report.metrics,
        diagnostics: report.diagnostics.map((d) => `${d.code}:${d.subjects.join(",")}`),
      }),
    },
  };
}
