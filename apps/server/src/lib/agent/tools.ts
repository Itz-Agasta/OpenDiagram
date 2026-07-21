import {
  classicTheme,
  diagramSpecSchema,
  layoutDiagram,
  renderSequenceDiagram,
  renderToExcalidraw,
  type DiagramSpec,
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
    execute: async (rawSpec): Promise<DrawDiagramOutput> => {
      // Icon keys the registry doesn't know are stripped BEFORE layout so both
      // sizing and rendering fall back to the theme's icon-less node (a box
      // with the label inside), never an empty glyph band.
      const unknownIcons = new Set<string>();
      const spec: DiagramSpec = {
        ...rawSpec,
        nodes: rawSpec.nodes.map((node) => {
          if (node.icon && !iconRegistry[node.icon]) {
            unknownIcons.add(node.icon);
            return { ...node, icon: undefined };
          }
          return node;
        }),
      };
      const warnings = [...unknownIcons].map((key) => `unknown icon "${key}" — drawn as a box`);

      // Sequence diagrams use their own lifeline grid, not ELK.
      let skeletons: RenderSkeleton[];
      let rawElements: Record<string, unknown>[];
      let edgeCount = spec.edges.length;
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
    // The model only ever sees the compact summary — element JSON is for the
    // client and would waste thousands of tokens per step.
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [{ type: "text", text: JSON.stringify(output.summary) }],
    }),
  });
}
