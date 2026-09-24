import { planViews, systemModelSchema, type DiagramSpec, type Theme } from "@OpenDiagram/harness";
import { tool, type ToolSet } from "ai";
import type { RequestLogger } from "evlog";
import { buildSystemPrompt } from "../../src/lib/agent/prompt";
import { askUserTool, createDrawDiagramTool } from "../../src/lib/agent/tools";

/** One agent setup under test: the system prompt and the tools it gets. */
export type Strategy = {
  instructions: string;
  tools: (log: RequestLogger, theme: Theme) => ToolSet;
};

const base = buildSystemPrompt();

/** Swaps one exact line of the production prompt; throws if the line moved, so a variant never silently tests production. */
function variant(edits: [from: string, to: string][]): string {
  return edits.reduce((prompt, [from, to]) => {
    if (!prompt.includes(from)) throw new Error(`prompt line not found: ${from.slice(0, 60)}`);
    return prompt.replace(from, to);
  }, base);
}

const NODE_CAP = `- 6-12 nodes for an overview. NEVER exceed 15 - merge minor services into one node with a sublabel instead (e.g. "Support Services" / "billing, notifications").`;
const SUBLABEL = `- sublabel = tech choice ("PostgreSQL 15", "Kafka"), 2-4 words.`;
const NO_LISTS = `- sublabel = ONE tech choice ("PostgreSQL 15", "Kafka"), 2-4 words. NEVER a comma list of features ("Cart, Order, Inventory") - that hides components the user asked for.`;
const DRAW_ONCE = `3. Call draw_diagram exactly once with the complete spec, IN THE SAME RESPONSE as the plan.`;

const MAX_NODES = 12;

/**
 * draw_diagram that refuses an oversized architecture diagram, so the split
 * decision is made by a count in code instead of by the model's judgement.
 * Sequence and ERD are exempt: their layouts do not degrade with size the same way.
 */
function gatedDraw(log: RequestLogger, theme: Theme) {
  const inner = createDrawDiagramTool(log, theme, []);
  return tool({
    description: inner.description,
    inputSchema: inner.inputSchema,
    toModelOutput: inner.toModelOutput,
    execute: async (input, options) => {
      const { nodes, type } = input as { nodes: unknown[]; type?: string };
      if (type !== "sequence" && type !== "erd" && nodes.length > MAX_NODES)
        throw new Error(
          `Not drawn: ${nodes.length} nodes is too many to read in one diagram (max ${MAX_NODES}). Split it now in this response: an OVERVIEW of at most 10 nodes (one node per domain, stores folded in), plus one focused diagram per major flow (5-10 nodes each). Keep every component the user named.`,
        );
      return inner.execute!(input, options);
    },
  });
}

/**
 * The model describes the system; `planViews` decides the diagrams; each view
 * then goes through the production draw pipeline (icons, layout, report).
 */
function drawSystem(log: RequestLogger, theme: Theme) {
  const inner = createDrawDiagramTool(log, theme, []);
  return tool({
    description:
      "Draw a system architecture from a model of it. Code turns the model into one diagram (small system) or an overview plus one diagram per flow (large system). Call once.",
    inputSchema: systemModelSchema,
    execute: async (model, options) => {
      const views: { spec: DiagramSpec; summary: unknown }[] = [];
      for (const spec of planViews(model)) {
        const out = await inner.execute!(spec as never, options);
        views.push({ spec, summary: (out as { summary: unknown }).summary });
      }
      return { views };
    },
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [{ type: "text", text: JSON.stringify(output.views.map((v) => v.summary)) }],
    }),
  });
}

export const strategies: Record<string, Strategy> = {
  /** Production today. */
  s0: {
    instructions: buildSystemPrompt(),
    tools: (log, theme) => ({
      ask_user: askUserTool,
      draw_diagram: createDrawDiagramTool(log, theme, []),
    }),
  },
  /** One bigger diagram: every named component is a node. */
  s1: {
    instructions: variant([
      [
        NODE_CAP,
        `- Size to the request: 6-12 nodes for a simple system, up to 30 when the user names many components. Every component the user names gets its own node.`,
      ],
      [SUBLABEL, NO_LISTS],
    ]),
    tools: (log, theme) => ({
      ask_user: askUserTool,
      draw_diagram: createDrawDiagramTool(log, theme, []),
    }),
  },
  /** Overview plus focused flow views, all authored by the LLM in one turn. */
  s2a: {
    instructions: variant([
      [
        DRAW_ONCE,
        `3. Draw IN THE SAME RESPONSE as the plan. Small or focused requests (one flow, under ~12 components): call draw_diagram exactly once. LARGE systems (many named components or several distinct flows): call draw_diagram several times in that one response - first an OVERVIEW (at most 12 nodes: one node per domain or subsystem, stores shared by a domain folded into it), then one FOCUSED diagram per major flow the user named or implied (e.g. "Ingestion pipeline", "Query path", "Checkout write path"), each at most 10 nodes in one straight left-to-right line. A "lifecycle of X" or "how one request travels" is a sequence diagram. At most 4 diagrams total. Reuse the same node id and label for the same component in every diagram. Every component the user named must appear in at least one diagram.`,
      ],
      [SUBLABEL, NO_LISTS],
    ]),
    tools: (log, theme) => ({
      ask_user: askUserTool,
      draw_diagram: createDrawDiagramTool(log, theme, []),
    }),
  },
  /** s2a with a countable split trigger and flow-view layout rules. */
  s2b: {
    instructions: variant([
      [
        DRAW_ONCE,
        `3. Draw IN THE SAME RESPONSE as the plan. First count the distinct components the user's text names or clearly needs (services, stores, queues, externals).
   - 12 or fewer, or the user asks about ONE flow: call draw_diagram exactly once.
   - More than 12: you MUST split. Call draw_diagram several times in that one response:
     a) OVERVIEW, at most 10 nodes: one node per domain/subsystem ("Ordering", "Ingestion pipeline"), with the stores that domain owns folded into it; only shared infrastructure (event bus, gateway) and clients/externals stay separate.
     b) One FOCUSED diagram per major flow the user named or clearly implied ("Ingestion pipeline", "Query path", "Checkout write path"), 5-10 nodes each. Title it after the flow.
     c) A "lifecycle of X" or "how one edit/request travels" is a type "sequence" diagram instead of a flow diagram.
     At most 4 diagrams. Reuse the same node id and label for the same component everywhere. Every component the user named appears in at least one diagram.
   - In a focused flow diagram the flow IS the layout: direction "LR", the steps as one left-to-right chain. Do NOT wrap the chain's steps in a group - a group stacks its members in one vertical column and breaks the line. Use groups there only for the stores the chain writes to, or omit groups.`,
      ],
      [SUBLABEL, NO_LISTS],
    ]),
    tools: (log, theme) => ({
      ask_user: askUserTool,
      draw_diagram: createDrawDiagramTool(log, theme, []),
    }),
  },
  /** s2b plus the node-count gate. */
  s2c: {
    get instructions() {
      return strategies.s2b!.instructions;
    },
    tools: (log, theme) => ({ ask_user: askUserTool, draw_diagram: gatedDraw(log, theme) }),
  },
  /** The LLM models the system; code plans and builds the views. */
  s3: {
    instructions: variant([
      [
        DRAW_ONCE,
        `3. Draw IN THE SAME RESPONSE as the plan.
   - The architecture of a system (services, stores, queues, cloud infra): call draw_system exactly once. You describe the SYSTEM and code decides the diagrams: a small system becomes one diagram, a large one an overview plus one diagram per flow. So there is NO node budget: list EVERY component the user's text names or clearly needs and never merge named components. Put each component that belongs to a subsystem in a domain ("Ordering", "Ingestion pipeline", "Search"); leave clients, externals and shared infrastructure (gateway, event bus, CDN) without a domain. flows = each major flow the user named or clearly implied, 4-10 steps in order, using component ids. type is "flow" by default; "sequence" ONLY when the user explicitly asks for a lifecycle, a sequence diagram, or how one request/edit travels step by step - every sequence flow becomes an extra diagram. Every system has at least one flow: its main request path.
   - ERDs, flowcharts, BPMN, or a request for one sequence diagram: call draw_diagram exactly once.`,
      ],
      [NODE_CAP, `- draw_diagram: 6-12 nodes. NEVER exceed 15.`],
      [SUBLABEL, NO_LISTS],
    ]),
    tools: (log, theme) => ({
      ask_user: askUserTool,
      draw_diagram: createDrawDiagramTool(log, theme, []),
      draw_system: drawSystem(log, theme),
    }),
  },
};
