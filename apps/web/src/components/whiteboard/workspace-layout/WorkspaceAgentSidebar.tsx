import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Loader2, PanelRightClose } from "lucide-react";
import type { StoredChatMessage } from "@/lib/chat-history";
import type { RepoGenerationJob } from "@/lib/projects-client";
import { AIChatPanel } from "../AIChatPanel";

type WorkspaceAgentSidebarProps = {
  activeFileType?: "diagram" | "doc";
  agentWidth: number;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  fileIdentity?: string;
  fileId?: string;
  initialHistory?: unknown[];
  initialModelId?: string;
  initialProviderId?: string;
  initialSpec?: unknown;
  hasExistingScene?: boolean;
  isOpen: boolean;
  isContextPending: boolean;
  projectId?: string;
  repoGenerationError: string | null;
  repoGenerationJob: RepoGenerationJob | null;
  onHistoryChange: (history: StoredChatMessage[]) => void;
  onQuotaError: (message: string) => void;
  onProviderError: (message: string) => void;
  onRateLimitError: (message: string) => void;
  onClose: () => void;
  onResizeStart: (pane: "sidebar" | "agent", event: React.MouseEvent) => void;
};

export function WorkspaceAgentSidebar({
  activeFileType,
  agentWidth,
  excalidrawAPI,
  fileIdentity,
  fileId,
  initialHistory,
  initialModelId,
  initialProviderId,
  initialSpec,
  hasExistingScene,
  isOpen,
  isContextPending,
  projectId,
  repoGenerationError,
  repoGenerationJob,
  onHistoryChange,
  onQuotaError,
  onProviderError,
  onRateLimitError,
  onClose,
  onResizeStart,
}: WorkspaceAgentSidebarProps) {
  return (
    <aside
      className={`group/agent relative h-full shrink-0 flex-col border-l border-od-border-soft bg-white ${isOpen ? "flex" : "hidden"}`}
      aria-hidden={!isOpen}
      inert={!isOpen}
      style={{ width: agentWidth }}
    >
      <div
        className="absolute inset-y-0 -left-[3px] z-20 w-[6px] cursor-col-resize opacity-0 transition-opacity group-hover/agent:opacity-100"
        onMouseDown={(event) => onResizeStart("agent", event)}
      >
        <div className="mx-auto h-full w-px bg-od-border-soft" />
      </div>
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-od-border-soft px-3">
        <p className="truncate text-[13px] font-medium text-od-ink">Picasso</p>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
          aria-label="Close agent panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 bg-od-canvas/30 p-2 pr-3"
        aria-busy={isContextPending}
      >
        <div
          aria-hidden={isContextPending}
          inert={isContextPending}
          className={`flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-od-border-soft bg-white ${isContextPending ? "invisible" : ""}`}
        >
          <AIChatPanel
            // Context is hidden and seed generation is gated until this loaded
            // identity is authoritative, so promotion cannot remount a live seed request.
            key={fileIdentity}
            activeFileType={activeFileType}
            allowSeedAutoRun={!isContextPending}
            excalidrawAPI={activeFileType === "doc" ? null : excalidrawAPI}
            projectId={projectId}
            fileId={fileId}
            initialHistory={initialHistory}
            initialModelId={initialModelId}
            initialProviderId={initialProviderId}
            initialSpec={initialSpec}
            hasExistingScene={hasExistingScene}
            repoGenerationJob={repoGenerationJob}
            repoGenerationError={repoGenerationError}
            onHistoryChange={onHistoryChange}
            onQuotaError={onQuotaError}
            onProviderError={onProviderError}
            onRateLimitError={onRateLimitError}
          />
        </div>
        {isContextPending && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-2 right-3 grid place-items-center rounded-xl border border-od-border-soft bg-white text-od-ink-muted"
          >
            <div className="flex items-center gap-2 text-[13px]">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Loading agent context...
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
