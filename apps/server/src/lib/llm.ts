import { createGoogle } from "@ai-sdk/google";
import { diagramSpecSchema, type DiagramSpec, type DiagramType } from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/server";
import { generateObject } from "ai";
import { buildIconCatalog } from "./icons/registry";

const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });

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

export async function generateDiagramSpec(input: {
  prompt: string;
  diagramType?: DiagramType;
}): Promise<DiagramSpec> {
  const result = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: diagramSpecSchema,
    system: buildSystemPrompt(input.diagramType),
    prompt: input.prompt,
    // Bounds runaway/repetition-loop generations (observed during testing:
    // gemini-2.5-flash occasionally gets stuck dumping a huge repeated string
    // into a field instead of terminating) so a bad completion fails fast
    // instead of hanging for a minute-plus. 8192 comfortably fits a normal
    // multi-node DiagramSpec while keeping worst-case failures quick.
    maxOutputTokens: 8192,
  });
  return result.object;
}
