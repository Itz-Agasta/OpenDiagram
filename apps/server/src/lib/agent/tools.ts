import {
  classicTheme,
  diagramSpecSchema,
  layoutDiagram,
  renderToExcalidraw,
  type RenderSkeleton,
  type Theme,
} from "@OpenDiagram/harness";
import { tool, type Tool } from "ai";
import type { RequestLogger } from "evlog";
import { z } from "zod";
import { iconRegistry } from "../icons/registry";

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

/** Server-side tool: validate spec -> layout (ELK) -> render -> canvas payload. */
export function createDrawDiagramTool(
  log: RequestLogger,
  theme: Theme = classicTheme,
): Tool<z.infer<typeof diagramSpecSchema>, DrawDiagramOutput> {
  return tool({
    description:
      "Render the final diagram to the user's canvas. Call exactly once per design, after you have written a short plan in chat.",
    inputSchema: diagramSpecSchema,
    execute: async (spec): Promise<DrawDiagramOutput> => {
      const positioned = await layoutDiagram(spec, theme);
      const { skeletons, rawElements } = renderToExcalidraw(positioned, iconRegistry, theme);
      if (positioned.warnings.length > 0) {
        log.warn("layoutDiagram sanitized malformed LLM output", {
          diagram: { layoutWarnings: positioned.warnings },
        });
      }
      log.set({
        diagram: {
          title: spec.title,
          diagramType: spec.type,
          nodeCount: spec.nodes.length,
          // Post-sanitize count -- matches what actually renders on canvas.
          edgeCount: positioned.edges.length,
          elementCount: skeletons.length + rawElements.length,
        },
      });
      return {
        skeletons,
        rawElements,
        summary: {
          title: spec.title,
          nodes: spec.nodes.length,
          edges: positioned.edges.length,
          warnings: positioned.warnings,
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
