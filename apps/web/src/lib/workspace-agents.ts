import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSpec } from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/web";
import { generateDiagram } from "@/lib/diagram-client";
import { applyDiagramToCanvas } from "@/lib/excalidraw-utils";
import { chatWithProject, getProjectContext } from "@/lib/projects-client";

export type WorkspaceAgentIntent = "diagram" | "project_chat";

export type WorkspaceAgentRoute = {
  intent: WorkspaceAgentIntent;
  pendingMessage: string;
};

export type WorkspaceAgentResult = {
  message: string;
  spec?: DiagramSpec;
};

const DIAGRAM_KEYWORDS =
  /\b(create|design|draw|generate|make|build|render|diagram|flow|architecture|system flow|canvas)\b/i;

export async function orchestrateWorkspaceRequest(input: {
  text: string;
  projectId?: string;
}): Promise<WorkspaceAgentRoute> {
  if (DIAGRAM_KEYWORDS.test(input.text)) {
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
    return { intent: "project_chat", pendingMessage: "Reading project context…" };
  }
}

export async function runDiagramAgent(input: {
  text: string;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  projectId?: string;
}): Promise<WorkspaceAgentResult> {
  if (!input.excalidrawAPI) {
    throw new Error("Canvas is still loading. Please try again in a moment.");
  }

  let context: string | undefined;
  if (input.projectId) {
    context = await getProjectContext(input.projectId, input.text)
      .then((result) => result.context)
      .catch(() => undefined);
  }

  const { spec, skeletons, rawElements } = await generateDiagram(input.text, undefined, context);
  await applyDiagramToCanvas(input.excalidrawAPI, skeletons, rawElements);

  return { message: `Done — "${spec.title}" (${spec.nodes.length} nodes).`, spec };
}

export async function runProjectChatAgent(input: {
  text: string;
  projectId?: string;
}): Promise<WorkspaceAgentResult> {
  if (!input.projectId) {
    throw new Error("Project chat requires a saved project.");
  }

  const { answer, sources } = await chatWithProject(input.projectId, input.text);
  const sourceSummary = sources.length
    ? `\n\nSources: ${sources.map((source) => source.title).join(", ")}`
    : "";

  return { message: `${answer}${sourceSummary}` };
}
