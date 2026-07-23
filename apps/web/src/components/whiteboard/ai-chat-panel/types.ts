import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSpec, RenderSkeleton } from "@OpenDiagram/harness";
import { diagramTypeSchema } from "@OpenDiagram/harness";
import type { StoredChatMessage } from "@/lib/chat-history";
import type { RepoGenerationJob } from "@/lib/projects-client";

export interface DrawDiagramOutput {
  skeletons: RenderSkeleton[];
  rawElements: unknown[];
  summary: { title: string; nodes: number; edges: number; warnings: string[] };
}

export interface AIChatPanelProps {
  activeFileType?: "diagram" | "doc";
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  projectId?: string;
  fileId?: string;
  initialHistory?: unknown[];
  initialSpec?: unknown;
  initialModelId?: string;
  initialProviderId?: string;
  hasExistingScene?: boolean;
  allowSeedAutoRun?: boolean;
  repoGenerationJob?: RepoGenerationJob | null;
  repoGenerationError?: string | null;
  onQuotaError?: (message: string) => void;
  onProviderError?: (message: string) => void;
  onRateLimitError?: (message: string) => void;
  onHistoryChange?: (history: StoredChatMessage[]) => void;
}

export type AIChatProviderOption = {
  id: string;
  label: string;
  providerId?: string;
  modelId?: string;
  providerLabel?: string;
  modelLabel?: string;
};

export function isRepoGeneratedSpec(value: unknown) {
  return Boolean(
    value && typeof value === "object" && (value as { kind?: unknown }).kind === "repo_generated",
  );
}

export function shouldUseDiagramChatDirectly(
  activeFileType: AIChatPanelProps["activeFileType"],
  initialSpec: unknown,
) {
  return activeFileType === "diagram" && !isRepoGeneratedSpec(initialSpec);
}

export function parseInitialDiagramSpec(value: unknown): DiagramSpec | undefined {
  const candidate =
    value && typeof value === "object" && "diagramSpec" in value
      ? (value as { diagramSpec?: unknown }).diagramSpec
      : value;
  if (!candidate || typeof candidate !== "object") return undefined;

  const spec = candidate as Partial<DiagramSpec>;
  return diagramTypeSchema.safeParse(spec.type).success &&
    typeof spec.title === "string" &&
    Array.isArray(spec.nodes) &&
    Array.isArray(spec.edges)
    ? (candidate as DiagramSpec)
    : undefined;
}
