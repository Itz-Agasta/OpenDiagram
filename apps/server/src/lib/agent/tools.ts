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
import type { FixEvent, FixStats, LayoutFixer } from "./fix";
import { polishView, renderView, type DrawDiagramOutput, type RenderedView } from "./render-view";

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

/** One view's fixer steps so far, streamed as a `data-fix` part while it polishes. */
interface FixProgress {
  title: string;
  lines: string[];
  status: "polishing" | "done";
}

/**
 * Where fixer steps go. A holder, like `fixer`: the tools are built before the
 * stream (and its writer) exists. `id` is `<toolCallId>-<view index>`.
 */
export type ProgressSink = { write?: (id: string, progress: FixProgress) => void };

/** The view as the client gets it: no log fields, no positioned layout. */
function forClient({ logFields: _, positioned: __, ...view }: RenderedView) {
  return view;
}

/** A pass's stats as wide-event fields; the names the fixer logged under before. */
function fixFields(stats: FixStats | undefined) {
  return {
    ...(stats?.triage && { fixTriage: stats.triage }),
    ...(stats?.fix && { fix: stats.fix }),
  };
}

/** draw_diagram's output: the client reads the spec from the tool input instead. */
function withoutSpec(view: RenderedView): DrawDiagramOutput {
  const { spec: _, ...output } = forClient(view);
  return output;
}

/**
 * The fixer's pass with its steps streamed to `id`. A throw keeps the first
 * draw: it is already on the canvas, and a failed tool call would make the
 * model draw the diagram a second time.
 */
async function polishStreamed(
  view: RenderedView,
  theme: Theme,
  fix: LayoutFixer,
  progress: ProgressSink,
  id: string,
  log: RequestLogger,
  part?: Parameters<LayoutFixer>[3],
): Promise<{ view: RenderedView; stats?: FixStats }> {
  const lines: string[] = [];
  let repeat = { text: "", times: 0 };
  const send = (status: FixProgress["status"]) =>
    progress.write?.(id, { title: view.spec.title, lines: [...lines], status });
  try {
    return await polishView(
      view,
      theme,
      fix,
      (event: FixEvent) => {
        // A model that repeats a move gets one row with a count, not three rows.
        if (event.text === repeat.text) {
          repeat.times++;
          lines[lines.length - 1] = `${event.text} (${repeat.times} times)`;
        } else {
          repeat = { text: event.text, times: 1 };
          lines.push(event.text);
        }
        send("polishing");
      },
      part,
    );
  } catch (error) {
    log.warn("layout fix threw, keeping the first draw", { error: String(error) });
    return { view };
  } finally {
    if (lines.length) send("done");
  }
}

/** Server-side tool: validate spec -> layout (ELK) -> render -> canvas payload. */
export function createDrawDiagramTool(
  log: RequestLogger,
  theme: Theme = classicTheme,
  canvas: { id: string; spec: DiagramSpec }[] = [],
  // A holder, not the fixer: the route builds tools before it has resolved a model.
  fixer: { run?: LayoutFixer } = {},
  progress: ProgressSink = {},
): Tool<z.infer<typeof drawDiagramInputSchema>, DrawDiagramOutput> {
  const draw = async ({ targetId, ...rawSpec }: z.infer<typeof drawDiagramInputSchema>) => {
    const previous = canvas.find((diagram) => diagram.id === targetId)?.spec;
    return renderView(restoreIcons(rawSpec as DiagramSpec, previous), theme);
  };
  const finish = (view: RenderedView, stats?: FixStats): DrawDiagramOutput => {
    if (view.summary.warnings.length > 0) {
      log.warn("draw_diagram sanitized malformed LLM output", {
        diagram: { layoutWarnings: view.summary.warnings },
      });
    }
    log.set({ diagram: view.logFields, ...fixFields(stats) });
    return withoutSpec(view);
  };
  // A generator only when a fixer runs: the SDK sends every yield as a
  // preliminary result and the last one again as final, so a plain draw
  // stays a promise and sends its 60-90KB payload once.
  async function* polished(
    input: z.infer<typeof drawDiagramInputSchema>,
    toolCallId: string,
    fix: LayoutFixer,
  ): AsyncGenerator<DrawDiagramOutput> {
    const first = await draw(input);
    yield { ...withoutSpec(first), fix: { status: "polishing" } };
    const { view: final, stats } = await polishStreamed(
      first,
      theme,
      fix,
      progress,
      `${toolCallId}-0`,
      log,
    );
    yield { ...finish(final, stats), fix: { status: "done", changed: final !== first } };
  }
  return tool({
    description:
      "Render the final diagram to the user's canvas. Call exactly once per design, after you have written a short plan in chat. Set targetId to update a diagram already on the canvas; omit it to add a new one.",
    inputSchema: drawDiagramInputSchema,
    execute: (input, { toolCallId }) =>
      fixer.run ? polished(input, toolCallId, fixer.run) : draw(input).then((view) => finish(view)),
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
  fixer: { run?: LayoutFixer } = {},
  progress: ProgressSink = {},
): Tool<z.infer<typeof drawSystemInputSchema>, DrawSystemOutput> {
  const draw = async (model: z.infer<typeof systemModelSchema>) => {
    // One at a time: layout is single-threaded CPU work, so parallel renders
    // saved no time and held every view's layout in memory at once.
    const rendered: RenderedView[] = [];
    for (const spec of planViews(model)) rendered.push(await renderView(spec, theme));
    return rendered;
  };
  const finish = (
    model: z.infer<typeof systemModelSchema>,
    rendered: RenderedView[],
    stats: (FixStats | undefined)[] = [],
  ) => {
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
        views: rendered.map(({ logFields: { spec: _, ...fields } }, i) => ({
          ...fields,
          ...fixFields(stats[i]),
        })),
      },
    });
    return rendered.map(forClient);
  };
  // Every first draw goes out in one yield, then each view polishes in turn:
  // a yield per view would resend the views before it each time.
  async function* polished(
    model: z.infer<typeof systemModelSchema>,
    toolCallId: string,
    fix: LayoutFixer,
  ): AsyncGenerator<DrawSystemOutput> {
    const first = await draw(model);
    yield {
      views: first.map((view) => ({ ...forClient(view), fix: { status: "polishing" as const } })),
    };
    // Numbered among the views the fixer polishes: a small system's sequence
    // views sit beside one complete view, which is not part of a set.
    const laid = first.filter((view) => view.positioned);
    const polishedViews = [];
    for (const [i, view] of first.entries())
      polishedViews.push(
        await polishStreamed(view, theme, fix, progress, `${toolCallId}-${i}`, log, {
          index: laid.indexOf(view),
          count: laid.length,
        }),
      );
    const final = polishedViews.map((p) => p.view);
    const stats = polishedViews.map((p) => p.stats);
    yield {
      views: finish(model, final, stats).map((view, i) => ({
        ...view,
        fix: { status: "done" as const, changed: final[i] !== first[i] },
      })),
    };
  }

  return tool({
    description:
      "Draw a system architecture from a model of it. Code turns the model into one diagram (small system) or an overview plus one diagram per flow (large system). Call once per system.",
    inputSchema: drawSystemInputSchema,
    execute: ({ replaceIds: _, ...model }, { toolCallId }) =>
      fixer.run
        ? polished(model, toolCallId, fixer.run)
        : draw(model).then((rendered) => ({ views: finish(model, rendered) })),
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [{ type: "text", text: JSON.stringify(output.views.map((v) => v.summary)) }],
    }),
  });
}
