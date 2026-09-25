import {
  classicTheme,
  diagramSpecSchema,
  planViews,
  systemModelSchema,
  type DiagramSpec,
  type Theme,
} from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/server";
import { tool, type Tool } from "ai";
import type { RequestLogger } from "evlog";
import { z } from "zod";
import { renderView, type DrawDiagramOutput } from "./render-view";

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

/**
 * The spec plus the one thing the model has to tell us that is not part of the
 * drawing: which diagram on the canvas this is.
 *
 * Extended rather than nested (`{ targetId, spec }`) on purpose. The schema stays
 * one flat object, which is the shape the model already emits reliably, and
 * `repairToolInput` in `chat-stream.ts` keeps finding `edges` at the top
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
      const {
        spec: _,
        logFields,
        ...output
      } = await renderView(restoreIcons(rawSpec as DiagramSpec, previous), theme);
      if (output.summary.warnings.length > 0) {
        log.warn("draw_diagram sanitized malformed LLM output", {
          diagram: { layoutWarnings: output.summary.warnings },
        });
      }
      log.set({ diagram: logFields });
      return output;
    },
    // The model only ever sees the compact summary - element JSON is for the
    // client and would waste thousands of tokens per step.
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [{ type: "text", text: JSON.stringify(output.summary) }],
    }),
  });
}

/**
 * The system model plus which frames it redraws. Flat for the same reason as
 * `drawDiagramInputSchema`: `repairToolInput` finds `links` and `flows` at the top.
 */
export const drawSystemInputSchema = systemModelSchema.extend({
  replaceIds: z
    .array(z.string())
    .optional()
    .describe(
      "When redrawing a system already on the canvas: the ids of ALL its diagrams, copied EXACTLY from CANVAS, overview first. Omit for a new system.",
    ),
});

export interface DrawSystemOutput {
  views: (DrawDiagramOutput & { spec: DiagramSpec })[];
}

/**
 * Server-side tool: the model describes the system, `planViews` decides the
 * diagrams (one for a small system, overview plus one per flow for a large
 * one), each drawn like `draw_diagram`. `spec` rides along per view because
 * the client stores it for CANVAS and cannot re-plan without the harness.
 */
export function createDrawSystemTool(
  log: RequestLogger,
  theme: Theme = classicTheme,
): Tool<z.infer<typeof drawSystemInputSchema>, DrawSystemOutput> {
  return tool({
    description:
      "Draw a system architecture from a model of it. Code turns the model into one diagram (small system) or an overview plus one diagram per flow (large system). Call once per system.",
    inputSchema: drawSystemInputSchema,
    execute: async ({ replaceIds: _, ...model }): Promise<DrawSystemOutput> => {
      // One at a time: layout is single-threaded CPU work, so parallel renders
      // saved no time and held every view's layout in memory at once.
      const rendered = [];
      for (const spec of planViews(model)) rendered.push(await renderView(spec, theme));
      const warnings = rendered.flatMap((view) => view.summary.warnings);
      if (warnings.length > 0) {
        log.warn("draw_system sanitized malformed LLM output", {
          diagram: { layoutWarnings: warnings },
        });
      }
      // One wide event for the whole set: a `log.set` per view would overwrite.
      log.set({
        diagram: {
          title: model.title,
          componentCount: model.components.length,
          flowCount: model.flows.length,
          // The model, not the views: `planViews` replays it for $0. Same gate as draw_diagram's spec.
          ...(env.LOG_DIAGRAM_SPEC && { model: JSON.stringify(model) }),
          // Same fields as draw_diagram's event, minus the spec: `model` above replays every view.
          views: rendered.map(({ logFields: { spec: _, ...fields } }) => fields),
        },
      });
      return { views: rendered.map(({ logFields: _, ...view }) => view) };
    },
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [{ type: "text", text: JSON.stringify(output.views.map((v) => v.summary)) }],
    }),
  });
}
