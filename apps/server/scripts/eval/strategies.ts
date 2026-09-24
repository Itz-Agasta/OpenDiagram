import type { Theme } from "@OpenDiagram/harness";
import type { ToolSet } from "ai";
import type { RequestLogger } from "evlog";
import { buildSystemPrompt } from "../../src/lib/agent/prompt";
import {
  askUserTool,
  createDrawDiagramTool,
  createDrawSystemTool,
} from "../../src/lib/agent/tools";

/** One agent setup under test: the system prompt and the tools it gets. */
export type Strategy = {
  instructions: string;
  tools: (log: RequestLogger, theme: Theme) => ToolSet;
};

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
};
