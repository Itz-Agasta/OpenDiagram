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
import { env } from "@OpenDiagram/env/server";
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
 * duplicate frame. Tracked separately; no inference fallback here by decision.
 */
export const drawDiagramInputSchema = diagramSpecSchema.extend({
  targetId: z
    .string()
    .optional()
    .describe(
      "The id of the existing canvas diagram this replaces, copied EXACTLY from the CANVAS list in the system prompt. Omit only when drawing a genuinely new diagram.",
    ),
});

/**
 * Puts back the icons CANVAS no longer ships (see the note on NODE_COLUMNS in canvas-dsl.ts).
 * Keyed by node id, so a node the model renames arrives iconless and picks a new
 * one - the same thing a genuinely new node does, and the model still sees the
 * label it is choosing for.
 */
function restoreIcons(spec: DiagramSpec, previous: DiagramSpec | undefined): DiagramSpec {
  if (!previous) return spec;
  const icons = new Map(previous.nodes.map((node) => [node.id, node.icon]));
  return {
    ...spec,
    nodes: spec.nodes.map((node) => {
      const icon = node.icon ?? icons.get(node.id);
      return icon ? { ...node, icon } : node;
    }),
  };
}

/** Server-side tool: validate spec -> layout (ELK) -> render -> canvas payload. */
export function createDrawDiagramTool(
  log: RequestLogger,
  theme: Theme = classicTheme,
  canvas: { id: string; spec: DiagramSpec }[] = [],
): Tool<z.infer<typeof drawDiagramInputSchema>, DrawDiagramOutput> {
  return tool({
    description:
      "Render the final diagram to the user's canvas. Call exactly once per design, after you have written a short plan in chat. Set targetId to update a diagram already on the canvas; omit it to add a new one.",
    inputSchema: drawDiagramInputSchema,
    execute: async ({ targetId, ...rawSpec }): Promise<DrawDiagramOutput> => {
      const previous = canvas.find((diagram) => diagram.id === targetId)?.spec;
      const { spec, unknownIcons } = normalizeSpecIcons<DiagramSpec>(
        restoreIcons(rawSpec as DiagramSpec, previous),
      );
      const warnings = unknownIcons.map((key) => `unknown icon "${key}" - drawn as a box`);

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
        // Post-sanitize count, matching what actually renders on canvas.
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
      });
      return {
        skeletons,
        rawElements,
        summary: {
          title: spec.title,
          nodes: spec.nodes.length,
          edges: edgeCount,
          warnings,
        },
      };
    },
    // The model only ever sees the compact summary - element JSON is for the
    // client and would waste thousands of tokens per step.
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [{ type: "text", text: JSON.stringify(output.summary) }],
    }),
  });
}
