import type { ComponentType } from "react";
import { FileText, PenTool, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SavedProjectFile } from "@/lib/projects-client";
import type { WorkspaceSidebarFile } from "@/lib/workspace-layout-store";
import { WorkspaceSidebarAccount } from "./WorkspaceSidebarAccount";

type WorkspaceSidebarProps = {
  accountImage?: string | null;
  accountName: string;
  isSignedIn: boolean;
  files: WorkspaceSidebarFile[];
  activeFileId?: string | null;
  projectName: string;
  width: number;
  onClose: () => void;
  onCreateFile: (type: SavedProjectFile["type"]) => void;
  onDeleteFile: (fileId: string) => void;
  onResizeStart: (pane: "sidebar" | "agent", event: React.MouseEvent) => void;
  onOpenFile: (fileId: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

function getFileIcon(
  type: SavedProjectFile["type"] | "diagram",
): ComponentType<{ className?: string }> {
  return type === "doc" ? FileText : PenTool;
}

export function WorkspaceSidebar({
  accountImage,
  accountName,
  isSignedIn,
  files,
  activeFileId,
  projectName,
  width,
  onClose,
  onCreateFile,
  onDeleteFile,
  onResizeStart,
  onOpenFile,
  onSignIn,
  onSignOut,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className="group/sidebar relative hidden h-full shrink-0 flex-col border-r border-od-border-soft bg-od-surface lg:flex"
      style={{ width }}
    >
      <div
        className="absolute inset-y-0 -right-[3px] z-20 w-[6px] cursor-col-resize opacity-0 transition-opacity group-hover/sidebar:opacity-100"
        onMouseDown={(event) => onResizeStart("sidebar", event)}
      >
        <div className="mx-auto h-full w-px bg-od-border-soft" />
      </div>

      <WorkspaceSidebarAccount
        accountImage={accountImage}
        accountName={accountName}
        isSignedIn={isSignedIn}
        onClose={onClose}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />

      <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
        <div className="mb-3 flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium uppercase tracking-[0.14em] text-od-ink-faint">
              {isSignedIn ? "Explorer" : "Guest diagram"}
            </p>
            <p className="mt-1 truncate text-[14px] font-semibold text-od-ink">{projectName}</p>
          </div>
          {isSignedIn && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Create file"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onSelect={() => onCreateFile("diagram")}
                  className="cursor-pointer"
                >
                  <PenTool className="h-4 w-4" />
                  New diagram
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCreateFile("doc")} className="cursor-pointer">
                  <FileText className="h-4 w-4" />
                  New doc
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto pb-4">
          {!isSignedIn ? (
            <p className="rounded-[8px] px-2 py-2 text-[13px] leading-5 text-od-ink-faint">
              One temporary diagram. Sign in to save it and create more files.
            </p>
          ) : files.length === 0 ? (
            <p className="rounded-[8px] px-2 py-2 text-[13px] text-od-ink-faint">No files yet</p>
          ) : (
            <div className="grid gap-0.5">
              {files.map((file) => {
                const Icon = getFileIcon(file.type);
                const active = file.id === activeFileId;

                return (
                  <div
                    key={file.id}
                    className={`group/file flex h-8 items-center rounded-[8px] transition ${
                      active
                        ? "bg-od-canvas/75 text-od-ink"
                        : "text-od-ink-muted hover:bg-od-canvas/45 hover:text-od-ink"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenFile(file.id)}
                      aria-current={active ? "page" : undefined}
                      className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-l-[8px] px-2 text-left text-[13px]"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-od-ink-faint" />
                      <span className="min-w-0 truncate">{file.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteFile(file.id)}
                      aria-label={`Delete ${file.name}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-od-ink-faint opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/file:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
