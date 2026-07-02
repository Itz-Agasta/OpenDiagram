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
  prompt: z.string().min(1),
  diagramType: diagramTypeSchema.optional(),
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

  const { prompt, diagramType } = parsed.data;

  let spec: DiagramSpec | undefined;
  let lastError: unknown;
  let attempts = 0;

  for (; attempts < MAX_ATTEMPTS && !spec; attempts++) {
    try {
      spec = await generateDiagramSpec({ prompt, diagramType });
    } catch (error) {
      lastError = error;
    }
  }

  if (!spec) {
    log.set({ diagram: { promptLength: prompt.length, diagramType, attempts } });
    log.error(lastError instanceof Error ? lastError : new Error("Diagram generation failed"));
    const message = lastError instanceof Error ? lastError.message : "Diagram generation failed";
    return c.json({ error: message }, 502);
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

  return c.json({ spec, skeletons, rawElements });
});
