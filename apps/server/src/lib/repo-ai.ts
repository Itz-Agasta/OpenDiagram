/** Runs capability-aware AI workflows for diagrams, project answers, and docs. */
import { diagramSpecSchema, type DiagramSpec, type DiagramType } from "@OpenDiagram/harness";
import { generateObject, generateText } from "ai";
import {
  resolveModel,
  runWithPlatformFallback,
  type AiCapability,
  type ResolvedModel,
} from "./ai-provider";
import { buildIconCatalog } from "./icons/registry";

// The AI SDK retries retryable errors (429/5xx) with exponential backoff.
export const LLM_MAX_RETRIES = 3;

const LLM_DEFAULTS = {
  maxTokens: 8192,
};

type ModelContext = {
  userId?: string;
  resolvedModel?: ResolvedModel;
};

async function resolveInputModel(input: ModelContext, capability: AiCapability) {
  return input.resolvedModel ?? resolveModel({ userId: input.userId, capability });
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
  let categories: string[] | undefined;
  if (diagramType === "erd") {
    categories = ["database", "storage"];
  } else if (diagramType === "cloud-architecture") {
    categories = [
      "service",
      "network",
      "queue",
      "gateway",
      "database",
      "storage",
      "cache",
      "function",
    ];
  } else if (diagramType === "system-design") {
    categories = [
      "client",
      "service",
      "external",
      "network",
      "queue",
      "gateway",
      "database",
      "storage",
      "cache",
      "function",
    ];
  }

  const parts = [
    "You are an expert software architect generating engineering diagrams.",
    "Output a DiagramSpec matching the provided schema. No markdown, no explanation, just the structured object.",
    DIAGRAM_TYPE_GUIDE,
    `Available icons (use exact key in node.icon field):\n${buildIconCatalog(categories)}`,
    COLOR_CONVENTIONS,
    RULES,
  ];
  if (diagramType) {
    const addition = DIAGRAM_TYPE_PROMPT_ADDITIONS[diagramType];
    if (addition) parts.push(addition);
  }
  return parts.join("\n\n");
}

// Diagram generation. Retries on rate limit.
export async function generateDiagramSpec(input: {
  prompt: string;
  diagramType?: DiagramType;
  context?: string;
  userId?: string;
  resolvedModel?: ResolvedModel;
}): Promise<DiagramSpec> {
  const userPrompt = input.context
    ? `Project context:\n${input.context}\n\nUser request:\n${input.prompt}`
    : input.prompt;

  const request = {
    system: buildSystemPrompt(input.diagramType),
    prompt: userPrompt,
    maxRetries: LLM_MAX_RETRIES,
    // Bounds runaway/repetition-loop generations (observed during testing:
    // gemini-2.5-flash occasionally gets stuck dumping a huge repeated string
    // into a field instead of terminating) so a bad completion fails fast
    // instead of hanging for a minute-plus. 8192 comfortably fits a normal
    // multi-node DiagramSpec while keeping worst-case failures quick.
    maxOutputTokens: LLM_DEFAULTS.maxTokens,
  };
  const resolved = await resolveInputModel(input, "structured");
  const { result } = await runWithPlatformFallback(resolved, (model) =>
    generateObject({ ...request, model, schema: diagramSpecSchema }),
  );
  return result.object;
}

// Project chat — grounded in project memory. Retries on rate limit.
export async function generateGroundedProjectAnswer(input: {
  message: string;
  context: string;
  userId?: string;
  resolvedModel?: ResolvedModel;
}): Promise<{ answer: string; resolvedModel: ResolvedModel }> {
  const request = {
    system: [
      "You are OpenDiagram's project assistant.",
      "Answer using only the provided project context.",
      "If the context is insufficient, say what is missing and suggest what the user can add to the project.",
      "Keep answers concise, specific, and grounded in the project's diagrams, docs, and files.",
    ].join("\n"),
    prompt: `Project context:\n${input.context}\n\nUser question:\n${input.message}`,
    maxRetries: LLM_MAX_RETRIES,
    maxOutputTokens: 1200,
  };
  const resolved = await resolveInputModel(input, "text");
  const { result, used } = await runWithPlatformFallback(resolved, (model) =>
    generateText({ ...request, model }),
  );

  return { answer: result.text, resolvedModel: used };
}

// Architecture docs / repo analysis. Retries on rate limit.
export async function generateArchitectureDoc(input: {
  context: string;
  goal: string;
  title: string;
  repoFullName: string;
  defaultBranch: string;
  commitSha: string;
  userId?: string;
  resolvedModel?: ResolvedModel;
}): Promise<string> {
  const request = {
    system: [
      "You are an expert software architect writing technical documentation.",
      "Write detailed, structured markdown using only the provided project context.",
      "Cover the architecture, key components, data flow, and design decisions.",
      "Use headings, bullet points, and code blocks for clarity.",
      "Cite specific source files from the context where relevant.",
      "If the context is insufficient, document what is known and note what needs investigation.",
      "Be specific: include actual file paths, module names, and framework details found in the context.",
      "Minimum 300 words. Do not add placeholder sections — write real content from the context.",
    ].join("\n"),
    prompt: [
      `Goal: ${input.goal}`,
      `Title: ${input.title}`,
      `Repository: ${input.repoFullName} (${input.defaultBranch} @ ${input.commitSha})`,
      "",
      "## Project Context",
      input.context,
      "",
      "## Instructions",
      `Write the document "${input.title}" based on the goal and context above.`,
      "Return valid markdown only — no wrapper explanations.",
    ].join("\n"),
    maxRetries: LLM_MAX_RETRIES,
    maxOutputTokens: 4096,
  };
  const resolved = await resolveInputModel(input, "text");
  const { result } = await runWithPlatformFallback(resolved, (model) =>
    generateText({ ...request, model }),
  );

  return result.text;
}
