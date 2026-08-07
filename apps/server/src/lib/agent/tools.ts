import {
  buildReport,
  classicTheme,
  diagramSpecSchema,
  layoutDiagram,
  renderSequenceDiagram,
  renderToExcalidraw,
  type DiagramReport,
  type DiagramSpec,
  type RenderSkeleton,
  type Theme,
} from "@OpenDiagram/harness";
import { tool, type Tool } from "ai";
import type { RequestLogger } from "evlog";
import { z } from "zod";
import { iconRegistry, normalizeSpecIcons } from "../icons/registry";

export interface AskUserInput {
  question: string;
  options: string[];
}

/**
 * Client-side tool (no `execute`): the web app renders the question as
 * quick-reply chips and feeds the answer back via `addToolOutput`.
 */
export const askUserTool: Tool<AskUserInput, string> = tool({
  description:
    "Ask the user ONE clarifying question before drawing. Use only when the request is genuinely ambiguous (scope, cloud provider, detail level). Never ask more than one round.",
  inputSchema: z.object({
    question: z.string(),
    options: z
      .array(z.string())
      .min(2)
      .max(4)
      .describe("2-4 short answer options for quick-reply chips"),
  }),
  outputSchema: z.string().describe("The user's answer"),
});

export interface DrawDiagramOutput {
  skeletons: RenderSkeleton[];
  rawElements: Record<string, unknown>[];
  summary: {
    title: string;
    nodes: number;
    edges: number;
    warnings: string[];
    /** Layout grade, advisory. Absent for sequence diagrams. */
    quality?: { score: number; issues: string[] };
  };
}

// Defect codes the model can actually act on by changing the SPEC. It has no
// pixels to move, so reporting EDGE_THROUGH_NODE or LABEL_COLLISION would only
// invite a redraw that cannot help -- those are ours to fix in layout.
const MODEL_ACTIONABLE = new Set(["EXTREME_ASPECT", "EDGE_CROSSING", "BACK_EDGE", "BEND_HEAVY"]);

/**
 * Compact, advisory quality note for the model. Deliberately not a retry
 * trigger: the agent decides whether a restructure is worth it, and a hard gate
 * here would loop on diagrams whose density is inherent to the request.
 */
function qualityNote(report: DiagramReport): { score: number; issues: string[] } {
  const issues = report.diagnostics
    .filter((d) => MODEL_ACTIONABLE.has(d.code))
    .map((d) => d.message);
  // Crossings repeat once per pair; collapse so one tangle is not 9 lines.
  const crossings = issues.filter((m) => m.includes("cross")).length;
  const rest = issues.filter((m) => !m.includes("cross"));
  return {
    score: report.score,
    issues: crossings > 0 ? [...rest, `${crossings} pairs of edges cross`] : rest,
  };
}

/**
 * The spec plus the one thing the model has to tell us that is not part of the
 * drawing: which diagram on the canvas this is.
 *
 * Extended rather than nested (`{ targetId, spec }`) on purpose. The schema stays
 * one flat object, which is the shape the model already emits reliably, and
 * `repairDrawDiagramInput` in `routes/diagram.ts` keeps finding `edges` at the top
 * level. Nesting would move it and quietly break the repair path.
 *
 * FIXME(gemini-field-fidelity): this assumes the model echoes `targetId` back
 * accurately. The same model reliably mistypes `from`/`to` as `from1`/`to1` on
 * edges, so an id it garbles or omits will read as "new diagram" and draw a
 * duplicate frame. Tracked separately -- no inference fallback here by decision.
 */
export const drawDiagramInputSchema = diagramSpecSchema.extend({
  targetId: z
    .string()
    .optional()
    .describe(
      "The id of the existing canvas diagram this replaces, copied EXACTLY from the CANVAS list in the system prompt. Omit only when drawing a genuinely new diagram.",
    ),
});

/** Server-side tool: validate spec -> layout (ELK) -> render -> canvas payload. */
export function createDrawDiagramTool(
  log: RequestLogger,
  theme: Theme = classicTheme,
): Tool<z.infer<typeof drawDiagramInputSchema>, DrawDiagramOutput> {
  return tool({
    description:
      "Render the final diagram to the user's canvas. Call exactly once per design, after you have written a short plan in chat. Set targetId to update a diagram already on the canvas; omit it to add a new one.",
    inputSchema: drawDiagramInputSchema,
    execute: async ({ targetId: _targetId, ...rawSpec }): Promise<DrawDiagramOutput> => {
      const { spec, unknownIcons } = normalizeSpecIcons<DiagramSpec>(rawSpec);
      const warnings = unknownIcons.map((key) => `unknown icon "${key}" — drawn as a box`);

      // Sequence diagrams use their own lifeline grid, not ELK.
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
        // Post-sanitize count -- matches what actually renders on canvas.
        edgeCount = positioned.edges.length;
        report = buildReport(positioned);
      }

      if (warnings.length > 0) {
        log.warn("draw_diagram sanitized malformed LLM output", {
          diagram: { layoutWarnings: warnings },
        });
      }
      log.set({
        diagram: {
          title: spec.title,
          diagramType: spec.type,
          nodeCount: spec.nodes.length,
          edgeCount,
          elementCount: skeletons.length + rawElements.length,
          // The spec itself, so a bad diagram can be replayed into the harness
          // test corpus. Counts alone are not reproducible.
          spec: JSON.stringify(spec),
          ...(report && {
            score: report.score,
            metrics: report.metrics,
            diagnostics: report.diagnostics.map((d) => `${d.code}:${d.subjects.join(",")}`),
          }),
        },
      });
      return {
        skeletons,
        rawElements,
        summary: {
          title: spec.title,
          nodes: spec.nodes.length,
          edges: edgeCount,
          warnings,
          ...(report && { quality: qualityNote(report) }),
        },
      };
    },
    // The model only ever sees the compact summary — element JSON is for the
    // client and would waste thousands of tokens per step.
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [{ type: "text", text: JSON.stringify(output.summary) }],
    }),
  });
}
