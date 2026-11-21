import type { ReactNode } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSpec, RenderSkeleton } from "@OpenDiagram/harness";
import { diagramTypeSchema } from "@OpenDiagram/harness/diagram-schema";
import type { StoredChatMessage } from "@/lib/chat-history";
import type { CreationQuotaError, RepoGenerationJob } from "@/lib/projects-client";

export interface DrawDiagramOutput {
  skeletons: RenderSkeleton[];
  rawElements: unknown[];
  summary: { title: string; nodes: number; edges: number; warnings: string[] };
  /** Only while the server's layout fixer is on; see `render-view.ts` on the server. */
  fix?: { status: "polishing" } | { status: "done"; changed: boolean };
}

/** One view's fixer steps, the `data-fix` part streamed while it polishes. */
export interface FixProgress {
  title: string;
  lines: string[];
  status: "polishing" | "done";
  /** On `done`, only when the fixer changed the drawing: what replaces the first draw. */
  view?: DrawDiagramOutput & { spec: DiagramSpec };
}

/** `draw_system`: overview first, then one view per flow. `spec` is what the canvas list stores. */
export interface DrawSystemOutput {
  views: (DrawDiagramOutput & { spec: DiagramSpec })[];
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
  onQuotaError?: (error: CreationQuotaError) => void;
  onProviderError?: (message: string) => void;
  onRateLimitError?: (message: string) => void;
  onHistoryChange?: (history: StoredChatMessage[]) => void;
  /** Rendered at the right end of the panel's top row (the close button). */
  headerAction?: ReactNode;
}

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
