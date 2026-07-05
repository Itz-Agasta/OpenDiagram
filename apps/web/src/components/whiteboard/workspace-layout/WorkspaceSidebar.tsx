import type { ComponentType } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, LogIn, LogOut, PenTool, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SavedProjectFile } from "@/lib/projects-client";
import type { WorkspaceSidebarFile } from "@/lib/workspace-layout-store";
import { getInitials } from "./helpers";

type WorkspaceSidebarProps = {
  accountImage?: string | null;
  accountName: string;
  isSignedIn: boolean;
  files: WorkspaceSidebarFile[];
  activeFileId?: string | null;
  projectName: string;
  width: number;
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

      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-od-border-soft px-3">
        <Link
          href="/dashboard"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-od-border-soft text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {accountImage ? (
          <img
            src={accountImage}
            alt=""
            className="h-8 w-8 rounded-[8px] border border-od-border-soft object-cover"
          />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-[8px] bg-od-ink text-[12px] font-semibold text-od-on-dark">
            {getInitials(accountName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{accountName}</p>
          <p className="truncate text-[11px] text-od-ink-faint">
            {isSignedIn ? "Signed in" : "Guest session"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account actions"
              className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
            >
              <Settings className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              {isSignedIn ? (
                <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer">
                  <LogOut className="h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={onSignIn} className="cursor-pointer">
                  <LogIn className="h-4 w-4" />
                  Sign in
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
        <div className="mb-3 min-w-0">
          <p className="truncate text-[12px] font-medium uppercase tracking-[0.14em] text-od-ink-faint">
            Explorer
          </p>
          <p className="mt-1 truncate text-[14px] font-semibold text-od-ink">{projectName}</p>
        </div>
        <div className="min-h-0 overflow-y-auto pb-4">
          {files.length === 0 ? (
            <p className="rounded-[8px] px-2 py-2 text-[13px] text-od-ink-faint">No files yet</p>
          ) : (
            <div className="grid gap-0.5">
              {files.map((file) => {
                const Icon = getFileIcon(file.type);
                const active = file.id === activeFileId;

                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onOpenFile(file.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-8 items-center gap-2 rounded-[8px] px-2 text-left text-[13px] transition ${
                      active
                        ? "bg-od-canvas/75 text-od-ink"
                        : "text-od-ink-muted hover:bg-od-canvas/45 hover:text-od-ink"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-od-ink-faint" />
                    <span className="min-w-0 truncate">{file.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
