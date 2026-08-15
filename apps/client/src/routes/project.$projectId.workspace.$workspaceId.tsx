import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { projectQueryOptions, projectFileQueryOptions, projectFilesQueryOptions } from "#/lib/api";
import {
  ArrowLeftIcon,
  ShapesIcon,
  FileTextIcon,
  FolderIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";
import { Whiteboard } from "#/components/whiteboard/Whiteboard";
import { AssistantBar } from "#/components/workspace/AssistantBar";
import { AssistantPanel } from "#/components/workspace/AssistantPanel";

export const Route = createFileRoute("/project/$projectId/workspace/$workspaceId")({
  component: WorkspaceRouteComponent,
});

function WorkspaceRouteComponent() {
  const { projectId, workspaceId } = Route.useParams();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAssistantMaximized, setIsAssistantMaximized] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");

  // Queries
  const { data: project, isLoading: isProjectLoading } = useQuery(projectQueryOptions(projectId));
  const { data: activeFile, isLoading: isActiveFileLoading } = useQuery(
    projectFileQueryOptions(projectId, workspaceId),
  );
  const { data: files, isLoading: isFilesLoading } = useQuery(projectFilesQueryOptions(projectId));

  const handleAssistantSubmit = () => {
    setIsAssistantMaximized(true);
  };

  return (
    <div
      className={`relative h-screen w-screen bg-white overflow-hidden font-geist ${
        isSidebarCollapsed
          ? "excalidraw-container-sidebar-closed"
          : "excalidraw-container-sidebar-open"
      }`}
    >
      {/* Floating Left Sidebar (Figma Style) */}
      {!isSidebarCollapsed && (
        <div className="absolute left-4 top-4 bottom-4 w-[260px] flex flex-col bg-white/80 backdrop-blur-md border border-gray-200 rounded-xl select-none z-50 shadow-lg">
          {/* Header Block */}
          <div className="p-4 flex flex-col gap-3 border-b border-gray-200/80">
            <div className="flex items-center gap-2">
              <Link
                to="/App"
                className="p-1 hover:bg-gray-200/60 rounded-md transition text-gray-500 hover:text-gray-900 cursor-pointer shrink-0"
                title="Back to Dashboard"
              >
                <ArrowLeftIcon size={16} weight="bold" />
              </Link>
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <FolderIcon size={14} className="text-gray-400 shrink-0" />
                {isProjectLoading ? (
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-16" />
                ) : (
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider truncate">
                    {project?.name || "Project"}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className="p-1 hover:bg-gray-200/60 rounded-md transition text-gray-500 hover:text-gray-900 cursor-pointer shrink-0"
                title="Collapse Sidebar"
              >
                <SidebarSimpleIcon size={16} weight="bold" />
              </button>
            </div>
            <div className="min-w-0">
              {isActiveFileLoading ? (
                <div className="h-4 bg-gray-200 rounded animate-pulse w-32 mt-1.5 mb-0.5" />
              ) : (
                <h1 className="heading-font truncate text-[16px] text-gray-800 leading-normal">
                  {activeFile?.name || "Untitled File"}
                </h1>
              )}
            </div>
          </div>

          {/* Files / Pages List */}
          <div className="flex-1 flex flex-col min-h-0 py-4">
            <div className="px-4 mb-2 flex items-center justify-between">
              <span className="text-[10px] uppercase font-semibold tracking-[0.16em] text-gray-400">
                Files
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
              {isFilesLoading ? (
                <div className="space-y-1 px-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-2 px-3 py-1.5 rounded-md">
                      <div className="h-3.5 w-3.5 rounded bg-gray-200/80 animate-pulse shrink-0" />
                      <div className="h-3.5 bg-gray-200/80 rounded animate-pulse w-2/3" />
                    </div>
                  ))}
                </div>
              ) : files && files.length > 0 ? (
                files.map((file) => {
                  const isActive = file.id === workspaceId;
                  const Icon = file.type === "diagram" ? ShapesIcon : FileTextIcon;

                  return (
                    <Link
                      key={file.id}
                      to="/project/$projectId/workspace/$workspaceId"
                      params={{ projectId, workspaceId: file.id }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition cursor-pointer leading-none ${
                        isActive
                          ? "bg-gray-200/80 text-gray-900 font-semibold"
                          : "text-gray-600 hover:bg-gray-200/40 hover:text-gray-800"
                      }`}
                    >
                      <Icon size={14} className={isActive ? "text-gray-800" : "text-gray-400"} />
                      <span className="truncate">{file.name}</span>
                    </Link>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-[11px] text-gray-400 italic">
                  No files in project
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Expand Button when Sidebar is Collapsed */}
      {isSidebarCollapsed && (
        <button
          onClick={() => setIsSidebarCollapsed(false)}
          className="absolute left-4 top-4 p-2 bg-white/80 backdrop-blur-md border border-gray-200 rounded-xl shadow-md text-gray-500 hover:text-gray-900 hover:bg-white transition cursor-pointer z-50 flex items-center justify-center"
          title="Expand Sidebar"
        >
          <SidebarSimpleIcon size={18} weight="bold" />
        </button>
      )}

      {/* AI Assistant Overlay/Bar */}
      {isAssistantMaximized ? (
        <AssistantPanel
          initialValue={assistantInput}
          onClose={() => setIsAssistantMaximized(false)}
        />
      ) : (
        <AssistantBar
          value={assistantInput}
          onChange={setAssistantInput}
          onMaximize={() => setIsAssistantMaximized(true)}
          onSubmit={handleAssistantSubmit}
        />
      )}

      {/* Main Canvas Area */}
      <div className="w-full h-full relative overflow-hidden bg-white">
        <Whiteboard />
      </div>
    </div>
  );
}
