import type { DiagramSpec } from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/web";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import { chatWithProject } from "@/lib/projects-client";

export type WorkspaceAgentIntent = "diagram" | "project_chat";

export type WorkspaceAgentId = "router" | "memory" | "diagram" | "canvas" | "answer";

export type WorkspaceAgentProgress = {
  agent: WorkspaceAgentId;
  status: "active" | "complete" | "failed";
  message?: string;
};

export type WorkspaceAgentRoute = {
  intent: WorkspaceAgentIntent;
  pendingMessage: string;
};

export type WorkspaceAgentResult = {
  message: string;
  spec?: DiagramSpec;
  aiProvider?: AiProviderUsage;
};

const DIAGRAM_NOUNS =
  /\b(diagram|flowchart|sequence diagram|architecture diagram|system flow|request flow|data flow|canvas|whiteboard)\b/i;
const DIAGRAM_VERBS = /\b(create|design|draw|generate|render|sketch|map)\b/i;
const DIAGRAM_TARGETS =
  /\b(diagram|architecture|system flow|request flow|data flow|sequence|flowchart)\b/i;
const ARCHITECTURE_INTENT =
  /\b(how should|what would|help me|can you|design|architect|build|create|model|visuali[sz]e|draw|generate|map)\b[\s\S]{0,100}\b(architecture|system|topology|component|service|api|database|auth|authentication|payment|checkout|event|queue|microservice|infrastructure|flow)\b/i;

export async function orchestrateWorkspaceRequest(input: {
  text: string;
  projectId?: string;
}): Promise<WorkspaceAgentRoute> {
  if (isLikelyDiagramRequest(input.text)) {
    return { intent: "diagram", pendingMessage: "Generating diagram…" };
  }

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    const intent: WorkspaceAgentIntent = data?.intent === "diagram" ? "diagram" : "project_chat";
    return {
      intent,
      pendingMessage: intent === "diagram" ? "Generating diagram…" : "Reading project context…",
    };
  } catch {
    return input.projectId
      ? { intent: "project_chat", pendingMessage: "Reading project context…" }
      : { intent: "diagram", pendingMessage: "Generating diagram…" };
  }
}

export function isLikelyDiagramRequest(text: string) {
  return (
    DIAGRAM_NOUNS.test(text) ||
    (DIAGRAM_VERBS.test(text) && DIAGRAM_TARGETS.test(text)) ||
    ARCHITECTURE_INTENT.test(text)
  );
}

export async function runProjectChatAgent(input: {
  text: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  onProgress?: (event: WorkspaceAgentProgress) => void;
}): Promise<WorkspaceAgentResult> {
  if (!input.projectId) {
    throw new Error("Project chat requires a saved project.");
  }

  input.onProgress?.({ agent: "memory", status: "active", message: "Reading project memory" });
  const { answer, sources, aiProvider } = await chatWithProject(
    input.projectId,
    input.text,
    input.providerId,
    input.modelId,
  );
  input.onProgress?.({
    agent: "memory",
    status: "complete",
    message: sources.length ? `Found ${sources.length} sources` : "No sources returned",
  });
  input.onProgress?.({ agent: "answer", status: "complete", message: "Response ready" });

  const sourceSummary = sources.length
    ? `\n\n*${sources.map((source) => source.title).join(", ")}*`
    : "";

  return { message: `${answer}${sourceSummary}`, aiProvider };
}
