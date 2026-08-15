import { useState, useRef, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  projectQueryOptions,
  projectFileQueryOptions,
  projectFilesQueryOptions,
  updateProjectFile,
} from "#/lib/api";
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
import { applyDiagramToCanvas } from "#/lib/utils/excalidraw-utils";
import {
  parseCanvasDiagrams,
  upsertCanvasDiagram,
  toPromptDiagrams,
  type CanvasDiagram,
} from "#/lib/utils/canvas-diagrams";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "";

export const Route = createFileRoute("/project/$projectId/workspace/$workspaceId")({
  component: WorkspaceRouteComponent,
});

function WorkspaceRouteComponent() {
  const { projectId, workspaceId } = Route.useParams();
  const queryClient = useQueryClient();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAssistantMaximized, setIsAssistantMaximized] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  // Queries
  const { data: project, isLoading: isProjectLoading } = useQuery(projectQueryOptions(projectId));
  const { data: activeFile, isLoading: isActiveFileLoading } = useQuery(
    projectFileQueryOptions(projectId, workspaceId),
  );
  const { data: files, isLoading: isFilesLoading } = useQuery(projectFilesQueryOptions(projectId));

  // Canvas diagrams ref
  const diagramsRef = useRef<CanvasDiagram[]>([]);

  // Update diagrams ref when activeFile query loads new data
  useEffect(() => {
    if (activeFile?.spec && typeof activeFile.spec === "object") {
      diagramsRef.current = parseCanvasDiagrams(activeFile.spec);
    } else {
      diagramsRef.current = [];
    }
  }, [activeFile]);

  // Vercel AI SDK useChat Hook with custom transport
  const transport = useRef<DefaultChatTransport<any> | null>(null);
  if (!transport.current) {
    transport.current = new DefaultChatTransport<any>({
      api: `${SERVER_URL.replace(/\/$/, "")}/api/diagram/chat`,
      body: () => ({
        diagrams: toPromptDiagrams(diagramsRef.current),
        theme: "sketch",
      }),
      prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
        body: { ...body, id, messages, trigger, messageId },
      }),
      fetch: ((input: any, init: any) => fetch(input, { ...init, credentials: "include" })) as any,
    });
  }

  const chat = useChat({
    transport: transport.current,
  });

  const appliedToolCallsRef = useRef(new Set<string>());

  // Listen to new messages and apply draw_diagram tool calls dynamically
  useEffect(() => {
    if (!excalidrawAPI || !chat.messages) return;

    const processToolCalls = async () => {
      for (const message of chat.messages) {
        if (message.role !== "assistant") continue;

        const parts = (message as any).parts || [];
        const toolInvocations = (message as any).toolInvocations || [];

        // 1. Check parts format
        for (const part of parts) {
          if (part.type === "tool-draw_diagram" && part.state === "output-available") {
            if (appliedToolCallsRef.current.has(part.toolCallId)) continue;
            appliedToolCallsRef.current.add(part.toolCallId);

            const { targetId, ...spec } = part.input as any;
            const output = part.output as any;

            if (output && output.skeletons) {
              const replaceFrameId =
                targetId && diagramsRef.current.some((d) => d.id === targetId) ? targetId : null;

              try {
                const { frameId } = await applyDiagramToCanvas(
                  excalidrawAPI,
                  output.skeletons,
                  output.rawElements || [],
                  { replaceFrameId },
                );

                if (frameId) {
                  const base = replaceFrameId
                    ? diagramsRef.current.filter((d) => d.id !== replaceFrameId)
                    : diagramsRef.current;

                  const updated = upsertCanvasDiagram(base, {
                    id: frameId,
                    title: spec.title || "Untitled",
                    spec,
                  });

                  diagramsRef.current = updated;

                  // Save back to DB
                  await updateProjectFile(projectId, workspaceId, {
                    spec: { diagrams: updated } as any,
                  });

                  // Invalidate cache
                  queryClient.invalidateQueries({
                    queryKey: ["projects", projectId, "files", workspaceId],
                  });
                }
              } catch (err) {
                console.error("Failed to apply diagram to canvas", err);
              }
            }
          }
        }

        // 2. Check toolInvocations format
        for (const invocation of toolInvocations) {
          if (invocation.toolName === "draw_diagram" && invocation.state === "result") {
            if (appliedToolCallsRef.current.has(invocation.toolCallId)) continue;
            appliedToolCallsRef.current.add(invocation.toolCallId);

            const { targetId, ...spec } = invocation.args as any;
            const output = invocation.result as any;

            if (output && output.skeletons) {
              const replaceFrameId =
                targetId && diagramsRef.current.some((d) => d.id === targetId) ? targetId : null;

              try {
                const { frameId } = await applyDiagramToCanvas(
                  excalidrawAPI,
                  output.skeletons,
                  output.rawElements || [],
                  { replaceFrameId },
                );

                if (frameId) {
                  const base = replaceFrameId
                    ? diagramsRef.current.filter((d) => d.id !== replaceFrameId)
                    : diagramsRef.current;

                  const updated = upsertCanvasDiagram(base, {
                    id: frameId,
                    title: spec.title || "Untitled",
                    spec,
                  });

                  diagramsRef.current = updated;

                  // Save back to DB
                  await updateProjectFile(projectId, workspaceId, {
                    spec: { diagrams: updated } as any,
                  });

                  // Invalidate cache
                  queryClient.invalidateQueries({
                    queryKey: ["projects", projectId, "files", workspaceId],
                  });
                }
              } catch (err) {
                console.error("Failed to apply diagram to canvas", err);
              }
            }
          }
        }
      }
    };

    void processToolCalls();
  }, [chat.messages, excalidrawAPI, projectId, workspaceId, queryClient]);

  const answerAskUser = (toolCallId: string, answer: string) => {
    chat.addToolOutput({ tool: "ask_user", toolCallId, output: answer });
  };

  const handleAssistantSubmit = () => {
    const text = assistantInput.trim();
    if (!text) return;

    const pending = pendingAskUser(chat.messages);
    if (pending) {
      answerAskUser(pending.toolCallId, text);
    } else {
      void chat.sendMessage({ text });
    }
    setAssistantInput("");
    setIsAssistantMaximized(true);
  };

  const handlePanelSubmit = () => {
    const text = assistantInput.trim();
    if (!text) return;

    const pending = pendingAskUser(chat.messages);
    if (pending) {
      answerAskUser(pending.toolCallId, text);
    } else {
      void chat.sendMessage({ text });
    }
    setAssistantInput("");
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
          messages={chat.messages}
          input={assistantInput}
          handleInputChange={(e) => setAssistantInput(e.target.value)}
          handleSubmit={handlePanelSubmit}
          setInput={setAssistantInput}
          onClose={() => setIsAssistantMaximized(false)}
          isLoading={chat.status === "streaming" || chat.status === "submitted"}
          onAnswerAskUser={answerAskUser}
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
        <Whiteboard onAPIReady={setExcalidrawAPI} />
      </div>
    </div>
  );
}

function pendingAskUser(messages: any[]) {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return null;

  const parts = last.parts || [];
  for (const part of parts) {
    if (part.type === "tool-ask_user" && part.state === "input-available") {
      return {
        toolCallId: part.toolCallId,
        input: part.input,
      };
    }
  }

  const toolInvocations = last.toolInvocations || [];
  for (const invocation of toolInvocations) {
    if (invocation.toolName === "ask_user" && invocation.state === "result") {
      if (invocation.state === "call") {
        return {
          toolCallId: invocation.toolCallId,
          input: invocation.args,
        };
      }
    }
  }

  return null;
}
