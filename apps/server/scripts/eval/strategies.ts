import type { Theme } from "@OpenDiagram/harness";
import { tool, type ToolSet } from "ai";
import type { RequestLogger } from "evlog";
import { buildSystemPrompt } from "../../src/lib/agent/prompt";
import {
  askUserTool,
  createDrawDiagramTool,
  createDrawSystemTool,
  drawDiagramInputSchema,
} from "../../src/lib/agent/tools";

/** One agent setup under test: the system prompt and the tools it gets. */
export type Strategy = {
  instructions: string;
  tools: (log: RequestLogger, theme: Theme) => ToolSet;
  /** The agent may redraw after seeing its report; only its last draw counts. */
  revises?: boolean;
};

/**
 * s1 additions. Appended after the production prompt, so where the two disagree
 * these win. Three ideas under test: keep the user's own content, let the agent
 * dictate arrangement in cells, and show it the layout report so it can redraw.
 */
const STEER = `OVERRIDES (these win over everything above when they conflict):

A. Whose content is it?
- AUTHOR mode: the user gave a short ask ("Netflix architecture") and you design the system. The playbook above applies.
- DRAFTER mode: the user gave you the content itself - a list of steps, an arrow chain, a pasted Mermaid/ASCII diagram, a table, named components with named connections, or wording like "do not invent" / "only these". You are drawing THEIR diagram:
  - Keep their labels word for word, in their language, emoji included. Keep their order and their count.
  - Add NO node, group, sublabel or edge label they did not write. No groups at all unless they asked for layers, zones, lanes or phases.
  - The playbook's "group aggressively", node budgets and sublabel rules do NOT apply.
  - Use draw_diagram, not draw_system, so it stays one diagram with exactly their parts.
- Content that is not software (history, study notes, business concepts) is still a diagram: nodes are ideas, edges are "leads to". Leave category and icon off those nodes.

B. Shapes carry meaning when the user asks for a notation: shape "ellipse" for start/end and for use cases, "diamond" for decisions, "rectangle" for steps.

C. Arrangement. You may dictate placement in CELLS (never pixels) with meta.arrange:
- meta.arrange.rows = a grid of node ids, row by row, e.g. [["a","b","c"],["d","e","f"]]. Use "" for an empty cell. Use it when the user states positions ("two rows of five", "X on the left, Y at the bottom", "layer at the bottom", a pasted ASCII layout whose arrangement you should mirror), and when a chain is longer than 6 steps: wrap it into rows of 4-5 so it is not a ribbon.
- meta.arrange.center = one node id: that node sits in the middle and every other node goes on a ring around it. Use it for hub or network pictures ("central anchor", "everything connects to X").
- With neither, the layout engine places by flow direction, which is right for ordinary architectures.

D. Look at the result. Each draw_diagram result carries "report": score (0-100), aspect (width/height), fit (1 = fits a screen at full size), and diagnostics naming edge and node ids. If score is under 70, or aspect is outside 0.5-2.6, or fit is under 0.6, redraw ONCE with a structural change, not a cosmetic one: switch meta.direction, use meta.arrange.rows, drop a group, or cut redundant edges. Do not write a new plan before the redraw. If the report is fine, do not redraw.`;

const STEER2 = `${STEER.slice(0, STEER.indexOf("D. Look at the result."))}D. Look at the result. Each draw_diagram result carries "report": score (0-100), aspect (width/height), fit (1 = fits a screen at full size), and diagnostics naming edge and node ids. If score is under 70, or aspect is outside 0.5-2.6, or fit is under 0.6, you may redraw ONE time with a structural change, not a cosmetic one: switch meta.direction, use meta.arrange.rows, drop a group, or cut redundant edges. Do not write a new plan before the redraw. The canvas keeps whichever of your two draws scored better and the result says which ("kept"). When a result says "final": true, never draw again in this turn.

E. Things that are not components:
- legend = [{ label, kind }] (or style "dashed"/"dotted"): set it when the user asks for a legend, or when your edges use different kinds that a reader must tell apart ("normal flow" sync, "feedback loop" async).
- notes = full sentences that belong beside the picture: a tagline, a caveat, a status remark, a closing line the user wrote. NEVER turn a sentence into a node.

F. UML use case diagram: actors are category "user" nodes; each use case is a node with shape "ellipse" and no icon; put all use cases in ONE group named after the system (the boundary); edges carry no label and endArrowhead "none" (only <<include>>/<<extend>> get a label and style "dashed"). When the user says which side each actor stands on, use meta.arrange.rows with the actors in the outer cells, e.g. [["admin","uc1","uc2","manager"],["","uc3","uc4",""],["","","staff",""]].`;

/** draw_diagram that shows the model the layout report, not just counts. */
function drawWithReport(log: RequestLogger, theme: Theme, keepBest = false) {
  let draws = 0;
  let best = -Infinity;
  let last: Record<string, unknown> = {};
  const capture = {
    ...log,
    set: (fields: Record<string, unknown>) => {
      last = (fields.diagram as Record<string, unknown>) ?? {};
      log.set(fields);
    },
  } as RequestLogger;
  const base = createDrawDiagramTool(capture, theme, []);
  return tool({
    description: `${base.description} The result includes a layout report; see OVERRIDES D.`,
    inputSchema: drawDiagramInputSchema,
    execute: base.execute!,
    toModelOutput: ({ output }) => {
      const metrics = last.metrics as { aspect: number; fit: number } | undefined;
      const report = metrics && {
        score: last.score,
        aspect: Math.round(metrics.aspect * 100) / 100,
        fit: Math.round(metrics.fit * 100) / 100,
        diagnostics: ((last.diagnostics as string[]) ?? []).slice(0, 8),
      };
      // Same rule as `effective` in run.ts: an unreadably small render is not a good one.
      const effective = report ? Number(report.score) - (report.fit < 0.6 ? 30 : 0) : 0;
      draws++;
      const kept = effective >= best ? "this draw" : "your previous draw";
      best = Math.max(best, effective);
      const verdict = keepBest ? { kept, final: draws >= 2 || undefined } : {};
      return {
        type: "content",
        value: [{ type: "text", text: JSON.stringify({ ...output.summary, report, ...verdict }) }],
      };
    },
  });
}

export const strategies: Record<string, Strategy> = {
  /** Production. Add a variant beside it to A/B a prompt or tool change. */
  s0: {
    instructions: buildSystemPrompt(),
    tools: (log, theme) => ({
      ask_user: askUserTool,
      draw_diagram: createDrawDiagramTool(log, theme, []),
      draw_system: createDrawSystemTool(log, theme),
    }),
  },
  /** Steering: drafter mode, meta.arrange, and the report fed back for one redraw. */
  s1: {
    instructions: `${buildSystemPrompt()}\n\n${STEER}`,
    revises: true,
    tools: (log, theme) => ({
      ask_user: askUserTool,
      draw_diagram: drawWithReport(log, theme),
      draw_system: createDrawSystemTool(log, theme),
    }),
  },
  /** s1 plus: one redraw with keep-best, legend and notes, use case notation. */
  s2: {
    instructions: `${buildSystemPrompt()}\n\n${STEER2}`,
    revises: true,
    tools: (log, theme) => ({
      ask_user: askUserTool,
      draw_diagram: drawWithReport(log, theme, true),
      draw_system: createDrawSystemTool(log, theme),
    }),
  },
};
