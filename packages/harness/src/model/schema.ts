import { z } from "zod";
import {
  edgeKindSchema as kindSchema,
  nodeCategorySchema as categorySchema,
} from "../diagram-schema.js";

// Gemini-safe like diagram-schema.ts: flat objects, optional enums, no refine/default/transform.

const domainSchema = z.object({
  id: z.string(),
  label: z.string().describe("Subsystem name, e.g. 'Ordering', 'Ingestion pipeline'"),
  sublabel: z.string().optional().describe("One short phrase, never a list"),
});

const componentSchema = z.object({
  id: z.string(),
  label: z.string(),
  sublabel: z.string().optional().describe("ONE tech choice, e.g. 'PostgreSQL 15'. Never a list."),
  category: categorySchema,
  // `icon` and `domain` are required, not optional: optional, the model skipped
  // them all-or-nothing (11 of 32 eval models had zero icons; one 16-component
  // model had zero domains, so nothing could collapse).
  icon: z.string().describe('Exact key from the icon catalog, or "none" when no key fits'),
  domain: z
    .string()
    .describe(
      'Id of the domain that owns it, or "shared" for clients, externals and infrastructure several domains use (gateway, event bus, CDN)',
    ),
});

const linkSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  kind: kindSchema.optional(),
  direction: z.enum(["uni", "bi"]).optional(),
});

const stepSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().describe("The call or message, 3 words max"),
  kind: kindSchema.optional(),
  reply: z
    .string()
    .optional()
    .describe("sequence flows only: the response sent back, e.g. 'user record'"),
});

const flowSchema = z.object({
  title: z.string().describe("Name of the flow, e.g. 'Checkout write path'"),
  type: z
    .enum(["flow", "sequence"])
    .describe("'sequence' for a lifecycle / how one request travels over time; else 'flow'"),
  steps: z.array(stepSchema).describe("In order. Component ids from `components`."),
});

export const systemModelSchema = z.object({
  title: z.string(),
  domains: z.array(domainSchema),
  components: z.array(componentSchema),
  links: z.array(linkSchema).optional().describe("Connections not already covered by a flow step"),
  flows: z.array(flowSchema),
});

export type SystemModel = z.infer<typeof systemModelSchema>;
export type SystemFlow = SystemModel["flows"][number];
