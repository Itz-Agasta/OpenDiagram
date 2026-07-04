import {
  diagramTypeSchema,
  layoutDiagram,
  renderToExcalidraw,
  type DiagramSpec,
} from "@OpenDiagram/harness";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { z } from "zod";
import { iconRegistry } from "../lib/icons/registry";
import { generateDiagramSpec } from "../lib/llm";

const generateRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  diagramType: diagramTypeSchema.optional(),
  context: z.string().max(8000).optional(),
});

export const diagramRoute = new Hono<EvlogVariables>();

const MAX_ATTEMPTS = 2;

diagramRoute.post("/generate", async (c) => {
  const log = c.get("log");
  const body = await c.req.json().catch(() => null);
  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const { prompt, diagramType, context } = parsed.data;

  let spec: DiagramSpec | undefined;
  let lastError: unknown;
  let attempts = 0;

  for (; attempts < MAX_ATTEMPTS && !spec; attempts++) {
    try {
      spec = await generateDiagramSpec({ prompt, diagramType, context });
    } catch (error) {
      lastError = error;
    }
  }

  if (!spec) {
    log.set({ diagram: { promptLength: prompt.length, diagramType, attempts } });
    log.error(lastError instanceof Error ? lastError : new Error("Diagram generation failed"));
    return c.json({ error: "Diagram generation failed. Please try again." }, 502);
  }

  const positioned = layoutDiagram(spec);
  const { skeletons, rawElements } = renderToExcalidraw(positioned, iconRegistry);
  log.set({
    diagram: {
      promptLength: prompt.length,
      diagramType,
      attempts,
      nodeCount: spec.nodes.length,
      edgeCount: spec.edges.length,
    },
  });
  if (positioned.warnings.length > 0) {
    log.warn("layoutDiagram sanitized malformed LLM output", {
      diagram: { layoutWarnings: positioned.warnings },
    });
  }

  return c.json({ spec, skeletons, rawElements });
});
