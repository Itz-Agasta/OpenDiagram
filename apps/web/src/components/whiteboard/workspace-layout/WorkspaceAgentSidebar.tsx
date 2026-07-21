import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { PanelRightClose } from "lucide-react";
import type { RepoGenerationJob } from "@/lib/projects-client";
import { AIChatPanel } from "../AIChatPanel";

type WorkspaceAgentSidebarProps = {
  activeFileId?: string;
  activeFileType?: "diagram" | "doc";
  agentWidth: number;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  fileId?: string;
  initialHistory?: { id: string; role: "user" | "assistant"; text: string }[];
  hasExistingScene?: boolean;
  projectId?: string;
  repoGenerationError: string | null;
  repoGenerationJob: RepoGenerationJob | null;
  onQuotaError: (message: string) => void;
  onClose: () => void;
  onResizeStart: (pane: "sidebar" | "agent", event: React.MouseEvent) => void;
};

export function WorkspaceAgentSidebar({
  activeFileId,
  activeFileType,
  agentWidth,
  excalidrawAPI,
  fileId,
  initialHistory,
  hasExistingScene,
  projectId,
  repoGenerationError,
  repoGenerationJob,
  onQuotaError,
  onClose,
  onResizeStart,
}: WorkspaceAgentSidebarProps) {
  return (
    <aside
      className="group/agent relative hidden h-full shrink-0 flex-col border-l border-od-border-soft bg-white lg:flex"
      style={{ width: agentWidth }}
    >
      <div
        className="absolute inset-y-0 -left-[3px] z-20 w-[6px] cursor-col-resize opacity-0 transition-opacity group-hover/agent:opacity-100"
        onMouseDown={(event) => onResizeStart("agent", event)}
      >
        <div className="mx-auto h-full w-px bg-od-border-soft" />
      </div>
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-od-border-soft px-3">
        <p className="truncate text-[13px] font-medium text-od-ink">Agent</p>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
          aria-label="Close agent panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      <AIChatPanel
        key={activeFileId ?? fileId}
        activeFileType={activeFileType}
        excalidrawAPI={activeFileType === "doc" ? null : excalidrawAPI}
        projectId={projectId}
        fileId={fileId}
        initialHistory={initialHistory}
        hasExistingScene={hasExistingScene}
        repoGenerationJob={repoGenerationJob}
        repoGenerationError={repoGenerationError}
        onQuotaError={onQuotaError}
      />
    </aside>
  );
}
