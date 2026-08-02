import type { DiagramSpec } from "@OpenDiagram/harness";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import { chatWithProject } from "@/lib/projects-client";

export type WorkspaceAgentId = "router" | "memory" | "diagram" | "canvas" | "answer";

export type WorkspaceAgentProgress = {
  agent: WorkspaceAgentId;
  status: "active" | "complete" | "failed";
  message?: string;
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

/**
 * Diagram-vs-question routing, decided locally.
 *
 * This used to be the fallback behind `POST /api/orchestrate`, which spent a
 * Groq call to classify the message into the same two buckets. The model call
 * only ever ran for doc files and GitHub-imported diagrams -- a normal canvas
 * takes the `shouldUseDiagramChatDirectly` path and never asked -- and it was
 * already skipped entirely whenever `GROQ_API_KEY` was unset or the request
 * failed, so this regex was the live path for any deploy without a Groq key.
 * Deleting the route makes that the only path, which costs routing accuracy on
 * phrasings the patterns miss and removes an LLM dependency, an auth-gated
 * endpoint and a rate-limit bucket from in front of every doc-file message.
 */
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
  signal?: AbortSignal;
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
    input.signal,
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
