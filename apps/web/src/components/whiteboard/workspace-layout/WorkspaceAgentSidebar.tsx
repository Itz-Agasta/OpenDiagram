import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Loader2, PanelRightClose } from "lucide-react";
import type { StoredChatMessage } from "@/lib/chat-history";
import type { CreationQuotaError, RepoGenerationJob } from "@/lib/projects-client";
import { AIChatPanel } from "../AIChatPanel";

type WorkspaceAgentSidebarProps = {
  activeFileType?: "diagram" | "doc";
  allowSeedAutoRun: boolean;
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
  onQuotaError: (error: CreationQuotaError) => void;
  onProviderError: (message: string) => void;
  onRateLimitError: (message: string) => void;
  onClose: () => void;
  onResizeStart: (event: React.MouseEvent) => void;
};

export function WorkspaceAgentSidebar({
  activeFileType,
  allowSeedAutoRun,
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
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
      aria-label="Close agent panel"
    >
      <PanelRightClose className="h-4 w-4" />
    </button>
  );

  return (
    <aside
      className={`group/agent relative h-full shrink-0 flex-col border-l border-od-border-soft bg-white ${isOpen ? "flex" : "hidden"}`}
      aria-hidden={!isOpen}
      inert={!isOpen}
      style={{ width: agentWidth }}
    >
      <div
        className="absolute inset-y-0 -left-[3px] z-20 w-[6px] cursor-col-resize opacity-0 transition-opacity group-hover/agent:opacity-100"
        onMouseDown={onResizeStart}
      >
        <div className="mx-auto h-full w-px bg-od-border-soft" />
      </div>
      <div className="relative flex min-h-0 flex-1" aria-busy={isContextPending}>
        <div
          aria-hidden={isContextPending}
          inert={isContextPending}
          className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${isContextPending ? "invisible" : ""}`}
        >
          <AIChatPanel
            // Built from route params, so it is stable across the whole load of a
            // given file and only changes when the file does. Seed generation is
            // gated separately by the caller, so promotion still cannot remount a
            // live seed request.
            key={fileIdentity}
            activeFileType={activeFileType}
            allowSeedAutoRun={allowSeedAutoRun}
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
            headerAction={closeButton}
          />
        </div>
        {isContextPending && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 grid place-items-center bg-white text-od-ink-muted"
          >
            {/* The panel's own row is inert while loading; closing must still work. */}
            <div className="absolute top-2 right-2">{closeButton}</div>
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
