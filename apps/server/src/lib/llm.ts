import "dotenv/config";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  diagramSpecSchema,
  diagramTypeSchema,
  type DiagramSpec,
  type DiagramType,
} from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/server";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { buildIconCatalog } from "./icons/registry";

const GOOGLE_DEFAULTS = {
  model: "gemini-2.5-flash",
  maxTokens: 8192,
};

const CUSTOM_DEFAULTS = {
  model: "gpt-4o",
  baseURL: "https://api.openai.com/v1",
  maxTokens: 8192,
};

const kimiNodeCategorySchema = z.enum([
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
]);

const kimiDiagramNodeSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  sublabel: z.string().optional(),
  icon: z.string().optional(),
  contains: z.array(z.string()).optional(),
  shape: z.enum(["rectangle", "ellipse", "diamond", "cylinder", "document"]).optional(),
  category: kimiNodeCategorySchema.optional(),
  type: z.string().optional(),
  style: z
    .object({
      strokeColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
      strokeWidth: z.number().optional(),
    })
    .optional(),
});

const kimiDiagramEdgeSchema = z.object({
  id: z.string().optional(),
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  protocol: z.string().optional(),
  direction: z.enum(["uni", "bi"]).optional(),
  style: z.unknown().optional(),
  startArrowhead: z.enum(["none", "arrow", "circle", "bar"]).optional(),
  endArrowhead: z.enum(["none", "arrow", "circle", "bar"]).optional(),
});

const kimiDiagramGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  sublabel: z.string().optional(),
  contains: z.array(z.string()).optional(),
  style: z.unknown().optional(),
  strokeColor: z.string().optional(),
  backgroundColor: z.string().optional(),
});

const kimiDiagramZoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  contains: z.array(z.string()),
  style: z.enum(["aws-region", "gcp-region", "availability-zone", "boundary"]).optional(),
});

const kimiRawDiagramSpecSchema = z.object({
  type: diagramTypeSchema.optional(),
  diagramType: diagramTypeSchema.optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  layout: z.unknown().optional(),
  nodes: z.array(kimiDiagramNodeSchema),
  edges: z.array(kimiDiagramEdgeSchema),
  groups: z.array(kimiDiagramGroupSchema).optional(),
  zones: z.array(kimiDiagramZoneSchema).optional(),
  meta: z
    .object({
      theme: z.enum(["light", "dark"]).optional(),
      direction: z.enum(["LR", "TB", "BT", "RL"]).optional(),
    })
    .optional(),
});

const kimiDiagramSpecSchema = z.union([
  diagramSpecSchema,
  kimiRawDiagramSpecSchema,
  z.object({ diagram: kimiRawDiagramSpecSchema }),
]);

function normalizeKimiDiagramSpec(
  object: z.infer<typeof kimiDiagramSpecSchema>,
  diagramType?: DiagramType,
): DiagramSpec {
  const raw = "diagram" in object ? object.diagram : object;
  const rawNodes = raw.nodes as z.infer<typeof kimiDiagramNodeSchema>[];
  const textNodeIds = new Set(
    rawNodes.filter((node) => isKimiTextNode(node)).map((node) => node.id),
  );
  const groupedNodes = rawNodes.filter((node) => node.type === "group" && node.contains?.length);
  const regularNodes = rawNodes.filter(
    (node) => node.type !== "group" && !textNodeIds.has(node.id),
  );
  const spec: DiagramSpec = {
    type: raw.type ?? raw.diagramType ?? diagramType ?? "system-design",
    title: raw.title ?? "Generated Diagram",
    description: raw.description,
    nodes: regularNodes.map((rawNode) => {
      const { contains, description, title, type, ...node } = rawNode as z.infer<
        typeof kimiDiagramNodeSchema
      >;
      void contains;
      void description;
      return {
        ...node,
        label: node.label ?? title ?? node.id,
        category: node.category ?? toKimiNodeCategory(type),
      };
    }),
    edges: raw.edges
      .filter((edge) => !textNodeIds.has(edge.from) && !textNodeIds.has(edge.to))
      .map(({ style, ...edge }) => ({
        ...edge,
        style: toKimiEdgeStyle(style),
      })),
    groups: [
      ...(raw.groups ?? [])
        .filter((group) => group.contains?.length)
        .map((group) => ({
          id: group.id,
          label: group.label,
          sublabel: group.sublabel,
          contains: group.contains ?? [],
          style: toKimiGroupStyle(group.style),
          strokeColor: group.strokeColor ?? getKimiStyleColor(group.style, "strokeColor"),
          backgroundColor:
            group.backgroundColor ?? getKimiStyleColor(group.style, "backgroundColor"),
        })),
      ...groupedNodes.map((node) => ({
        id: node.id,
        label: node.label ?? node.title ?? node.id,
        sublabel: node.sublabel,
        contains: node.contains ?? [],
        style: "vpc" as const,
        strokeColor: node.style?.strokeColor,
        backgroundColor: node.style?.backgroundColor,
      })),
    ],
    zones: raw.zones,
    meta: raw.meta,
  };

  return diagramSpecSchema.parse(spec);
}

function toKimiNodeCategory(value?: string): z.infer<typeof kimiNodeCategorySchema> | undefined {
  const parsed = kimiNodeCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function isKimiTextNode(node: z.infer<typeof kimiDiagramNodeSchema>): boolean {
  const type = node.type?.toLowerCase();
  if (!type) return false;
  return [
    "text",
    "label",
    "note",
    "annotation",
    "caption",
    "legend",
    "title",
    "description",
  ].includes(type);
}

function toKimiEdgeStyle(value: unknown): DiagramSpec["edges"][number]["style"] {
  return value === "solid" || value === "dashed" || value === "dotted" ? value : undefined;
}

function toKimiGroupStyle(value: unknown): NonNullable<DiagramSpec["groups"]>[number]["style"] {
  if (value === "vpc" || value === "region" || value === "subnet" || value === "cluster")
    return value;
  if (value === "swimlane" || value === "box") return value;
  return "box";
}

function getKimiStyleColor(
  value: unknown,
  key: "strokeColor" | "backgroundColor",
): string | undefined {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const color = (value as Record<string, unknown>)[key];
  return typeof color === "string" ? color : undefined;
}

function createGeminiModel() {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required when AI_PROVIDER is set to 'google'");
  }
  const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  return google(GOOGLE_DEFAULTS.model);
}

function createKimiModel() {
  if (!env.CUSTOM_AI_API_KEY) {
    throw new Error("CUSTOM_AI_API_KEY is required when AI_PROVIDER is set to 'custom'");
  }
  const openai = createOpenAI({
    apiKey: env.CUSTOM_AI_API_KEY,
    baseURL: env.CUSTOM_AI_BASE_URL ?? CUSTOM_DEFAULTS.baseURL,
  });
  return openai.chat(env.CUSTOM_AI_MODEL ?? CUSTOM_DEFAULTS.model);
}

const DIAGRAM_TYPE_GUIDE = `Diagram type guide:
- system-design: microservices, APIs, data flow between services
- sequence: request/response flows, interactions over time
- erd: database schema, entities and relationships
- flowchart: decision trees, process flows
- bpmn: business processes, swimlanes
- cloud-architecture: AWS/GCP/Azure infra
- network: network topology, firewalls, routing
- infra: general infrastructure diagrams`;

const COLOR_CONVENTIONS = `Color conventions (use in node.style):
- Services/APIs: strokeColor #1e40af, backgroundColor #dbeafe
- Databases: strokeColor #166534, backgroundColor #dcfce7
- Queues/Events: strokeColor #92400e, backgroundColor #fef3c7
- External/3rd party: strokeColor #6b7280, backgroundColor #f3f4f6
- Gateways: strokeColor #7c2d12, backgroundColor #fed7aa
- Caches: strokeColor #6d28d9, backgroundColor #ede9fe
- Groups/VPC: strokeColor #374151, backgroundColor transparent, strokeStyle dashed`;

const RULES = `Rules:
- Every node MUST have an id (snake_case, unique)
- Groups reference node ids in contains[]
- Edges reference node ids in from/to
- Prefer real icon keys over generic shapes
- Include sublabel for tech stack details (e.g. "PostgreSQL 15")
- Add protocol labels on edges (REST, gRPC, TCP, AMQP, etc.)
- Layout is a generic directed-graph layout — avoid the "sequence" type this pass, prefer "flowchart" with numbered step labels for request/response flows instead
- Keep every text field (title, label, sublabel, description, edge label) short — one line, under 60 characters
- Never enumerate exhaustive lists of features, services, or capabilities in any field — summarize in a few words instead`;

const DIAGRAM_TYPE_PROMPT_ADDITIONS: Partial<Record<DiagramType, string>> = {
  "system-design":
    "Generate a system-design diagram. Show all services as nodes with AWS/GCP icons where applicable. Include: API Gateway, Load Balancer, application services, databases, caches, queues. Group services inside VPC/network boundaries. Label all connections with protocols.",
  erd: "Generate an ERD. Each entity = database table. Show all columns with types in the sublabel. Group related entities visually.",
  "cloud-architecture":
    "Generate a cloud-architecture diagram using real AWS/GCP/Azure icons. Group resources inside VPC/region/subnet boundaries where relevant.",
};

function buildSystemPrompt(diagramType?: DiagramType): string {
  const parts = [
    "You are an expert software architect generating engineering diagrams.",
    "Output a DiagramSpec matching the provided schema. No markdown, no explanation, just the structured object.",
    DIAGRAM_TYPE_GUIDE,
    `Available icons (use exact key in node.icon field):\n${buildIconCatalog()}`,
    COLOR_CONVENTIONS,
    RULES,
  ];
  if (diagramType) {
    const addition = DIAGRAM_TYPE_PROMPT_ADDITIONS[diagramType];
    if (addition) parts.push(addition);
  }
  return parts.join("\n\n");
}

function buildKimiSystemPrompt(diagramType?: DiagramType): string {
  return [
    buildSystemPrompt(diagramType),
    "Kimi/OpenAI-compatible gateway instructions:",
    "- Return the DiagramSpec object at the top level whenever possible.",
    "- Do not wrap the object in keys like diagram, data, result, or output.",
    "- Do not add node.type fields; use only fields present in the schema.",
    "- Do not create text, label, note, annotation, caption, legend, or title nodes.",
  ].join("\n\n");
}

async function generateGeminiDiagramSpec(input: {
  prompt: string;
  diagramType?: DiagramType;
  context?: string;
}): Promise<DiagramSpec> {
  const userPrompt = input.context
    ? `Project context:\n${input.context}\n\nUser request:\n${input.prompt}`
    : input.prompt;

  const result = await generateObject({
    model: createGeminiModel(),
    schema: diagramSpecSchema,
    system: buildSystemPrompt(input.diagramType),
    prompt: userPrompt,
    // Bounds runaway/repetition-loop generations (observed during testing:
    // gemini-2.5-flash occasionally gets stuck dumping a huge repeated string
    // into a field instead of terminating) so a bad completion fails fast
    // instead of hanging for a minute-plus. 8192 comfortably fits a normal
    // multi-node DiagramSpec while keeping worst-case failures quick.
    maxOutputTokens: GOOGLE_DEFAULTS.maxTokens,
  });
  return result.object;
}

async function generateKimiDiagramSpec(input: {
  prompt: string;
  diagramType?: DiagramType;
  context?: string;
}): Promise<DiagramSpec> {
  const userPrompt = input.context
    ? `Project context:\n${input.context}\n\nUser request:\n${input.prompt}`
    : input.prompt;

  const result = await generateObject({
    model: createKimiModel(),
    schema: kimiDiagramSpecSchema,
    system: buildKimiSystemPrompt(input.diagramType),
    prompt: userPrompt,
    maxOutputTokens: CUSTOM_DEFAULTS.maxTokens,
    providerOptions: { openai: { structuredOutputs: false } },
  });
  return normalizeKimiDiagramSpec(
    result.object as z.infer<typeof kimiDiagramSpecSchema>,
    input.diagramType,
  );
}

export async function generateDiagramSpec(input: {
  prompt: string;
  diagramType?: DiagramType;
  context?: string;
}): Promise<DiagramSpec> {
  if (env.AI_PROVIDER === "custom") return generateKimiDiagramSpec(input);
  return generateGeminiDiagramSpec(input);
}

export async function generateGroundedProjectAnswer(input: {
  message: string;
  context: string;
}): Promise<string> {
  const result = await generateText({
    model: env.AI_PROVIDER === "custom" ? createKimiModel() : createGeminiModel(),
    system: [
      "You are OpenDiagram's project assistant.",
      "Answer using only the provided project context.",
      "If the context is insufficient, say what is missing and suggest what the user can add to the project.",
      "Keep answers concise, specific, and grounded in the project's diagrams, docs, and files.",
    ].join("\n"),
    prompt: `Project context:\n${input.context}\n\nUser question:\n${input.message}`,
    maxOutputTokens: 1200,
  });

  return result.text;
}
