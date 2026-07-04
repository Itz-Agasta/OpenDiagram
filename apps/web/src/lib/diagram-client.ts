import { env } from "@OpenDiagram/env/web";
import type { DiagramSpec, DiagramType, RenderSkeleton } from "@OpenDiagram/harness";

export interface DiagramGenerateResult {
  spec: DiagramSpec;
  skeletons: RenderSkeleton[];
  rawElements: unknown[];
}

export async function generateDiagram(
  prompt: string,
  diagramType?: DiagramType,
  context?: string,
): Promise<DiagramGenerateResult> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/diagram/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, diagramType, context }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed with status ${response.status}`);
  }

  return data;
}
