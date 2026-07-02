import { z } from "zod";

/**
 * Runtime zod mirror of `DiagramSpec` (schema.ts), used as the `schema` param
 * for `generateObject`/`streamObject`. Kept loose — no `.refine()`, `.transform()`,
 * `.default()`, or string constraints — Gemini's structured output only supports
 * an OpenAPI 3.0 subset. Extra validation happens after the object resolves.
 */

export const diagramTypeSchema = z.enum([
  "system-design",
  "sequence",
  "erd",
  "flowchart",
  "bpmn",
  "network",
  "infra",
  "cloud-architecture",
]);

const diagramNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  sublabel: z.string().optional(),
  icon: z.string().optional(),
  shape: z.enum(["rectangle", "ellipse", "diamond", "cylinder", "document"]).optional(),
  category: z
    .enum([
      "service",
      "database",
      "queue",
      "gateway",
      "client",
      "external",
      "storage",
      "cache",
      "function",
      "user",
    ])
    .optional(),
  style: z
    .object({
      strokeColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
      strokeWidth: z.number().optional(),
    })
    .optional(),
});

const diagramEdgeSchema = z.object({
  id: z.string().optional(),
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  protocol: z.string().optional(),
  direction: z.enum(["uni", "bi"]).optional(),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
  startArrowhead: z.enum(["none", "arrow", "circle", "bar"]).optional(),
  endArrowhead: z.enum(["none", "arrow", "circle", "bar"]).optional(),
});

const diagramGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  sublabel: z.string().optional(),
  contains: z.array(z.string()),
  style: z.enum(["vpc", "region", "subnet", "cluster", "swimlane", "box"]).optional(),
  strokeColor: z.string().optional(),
  backgroundColor: z.string().optional(),
});

const diagramZoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  contains: z.array(z.string()),
  style: z.enum(["aws-region", "gcp-region", "availability-zone", "boundary"]).optional(),
});

export const diagramSpecSchema = z.object({
  type: diagramTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  nodes: z.array(diagramNodeSchema),
  edges: z.array(diagramEdgeSchema),
  groups: z.array(diagramGroupSchema).optional(),
  zones: z.array(diagramZoneSchema).optional(),
  meta: z
    .object({
      theme: z.enum(["light", "dark"]).optional(),
      direction: z.enum(["LR", "TB", "BT", "RL"]).optional(),
    })
    .optional(),
});
