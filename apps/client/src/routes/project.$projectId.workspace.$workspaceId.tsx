import { useState, useRef, useEffect, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectQueryOptions,
  projectFileQueryOptions,
  projectFilesQueryOptions,
  createProjectFile,
} from "#/lib/api";
import { useApplyDrawDiagram } from "#/hooks/useApplyDrawDiagram";
import { useChatThread } from "#/hooks/useChatThread";
import { useDiagramChat } from "#/hooks/useDiagramChat";
import { useSceneAutosave } from "#/hooks/useSceneAutosave";
import {
  ArrowLeftIcon,
  ShapesIcon,
  FileTextIcon,
  FolderIcon,
  SidebarSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { Dialog, DialogClose, DialogTitle, Tabs, useKumoToastManager } from "@cloudflare/kumo";
import { CreationQuotaError, AiProviderCreditError, UpstreamRateLimitError } from "#/lib/types";
import { HeroButton, CustomButton } from "#/components/ui/button";
import { Whiteboard } from "#/components/whiteboard/Whiteboard";
import { AssistantBar } from "#/components/workspace/AssistantBar";
import { AssistantPanel } from "#/components/workspace/AssistantPanel";
import { sceneToInitialData } from "#/lib/utils/excalidraw-utils";
import { parseCanvasDiagrams, type CanvasDiagram } from "#/lib/utils/canvas-diagrams";
import { pendingAskUser } from "#/lib/utils/diagram-chat";
import {
  normalizeStoredChatHistory,
  storedChatMessageToUIMessage,
  type StoredChatMessage,
} from "#/lib/utils/chat-history";
import { getPendingFiles, clearPendingFiles, type OfflinePendingFile } from "#/lib/utils";

export const Route = createFileRoute("/project/$projectId/workspace/$workspaceId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { init?: boolean; modelId?: string; providerId?: string } => {
    return {
      init: search.init === true || search.init === "true" || undefined,
      modelId: typeof search.modelId === "string" ? search.modelId : undefined,
      providerId: typeof search.providerId === "string" ? search.providerId : undefined,
    };
  },
  component: WorkspaceRouteComponent,
});

function WorkspaceRouteComponent() {
  const { projectId, workspaceId } = Route.useParams();
  const { init, modelId: searchModelId, providerId: searchProviderId } = Route.useSearch();
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState<string | null>(searchModelId || null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(searchProviderId || null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAssistantMaximized, setIsAssistantMaximized] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [canvasSeed, setCanvasSeed] = useState<{ fileId: string; data: unknown } | null>(null);
  const [isHistorySeeded, setIsHistorySeeded] = useState(false);
  const [threadMessages, setThreadMessages] = useState<StoredChatMessage[] | null>(null);
  const initTriggeredRef = useRef(false);
  const openedForAskRef = useRef<string | null>(null);

  const navigate = useNavigate({ from: Route.fullPath });
  const toastManager = useKumoToastManager();

  // Create File State
  const [isCreateFileOpen, setIsCreateFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileType, setNewFileType] = useState<"diagram" | "doc">("diagram");

  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    toastManager.promise(
      createProjectFile(projectId, { name: newFileName.trim(), type: newFileType }),
      {
        loading: {
          title: "Creating file...",
          description: "Initializing your new file.",
        },
        success: (newFile) => {
          setNewFileName("");
          setIsCreateFileOpen(false);
          queryClient.invalidateQueries({ queryKey: ["projects", projectId, "files"] });
          void navigate({
            to: "/project/$projectId/workspace/$workspaceId",
            params: { projectId, workspaceId: newFile.id },
          });
          return {
            title: "File created",
            description: "File was successfully created.",
            variant: "success",
          };
        },
        error: (err) => ({
          title: "Failed to create file",
          description: err.message,
          variant: "error",
        }),
      },
    );
  };

  // Queries
  const { data: project, isLoading: isProjectLoading } = useQuery(projectQueryOptions(projectId));
  const { data: activeFile, isLoading: isActiveFileLoading } = useQuery(
    projectFileQueryOptions(projectId, workspaceId),
  );
  const { data: files, isLoading: isFilesLoading } = useQuery(projectFilesQueryOptions(projectId));

  const handleThreadMessages = useCallback((messages: StoredChatMessage[] | null) => {
    setThreadMessages(messages);
  }, []);

  const { persistTurn, threadLoaded } = useChatThread({
    projectId,
    fileId: workspaceId,
    onMessagesLoaded: handleThreadMessages,
  });

  const diagramsRef = useRef<CanvasDiagram[]>([]);
  const skippedMessageIdsRef = useRef(new Set<string>());
  const { handleSceneChange, markSeeded, commitAppliedScene } = useSceneAutosave(
    projectId,
    workspaceId,
  );

  // File switch: wipe per-file UI state. Chat/apply/autosave reset themselves
  // from `fileId`. Canvas remounts via `Whiteboard key={workspaceId}`.
  useEffect(() => {
    diagramsRef.current = [];
    skippedMessageIdsRef.current.clear();
    setCanvasSeed(null);
    setIsHistorySeeded(false);
    setThreadMessages(null);
    initTriggeredRef.current = false;
    openedForAskRef.current = null;
  }, [workspaceId]);

  // Seed the in-memory diagram list from the file spec, only while empty, so
  // a refetch after autosave cannot wipe a draw that is not written back yet.
  useEffect(() => {
    if (isActiveFileLoading) return;
    if (diagramsRef.current.length > 0) return;
    const seeded = parseCanvasDiagrams(activeFile?.spec);
    if (seeded.length === 0) return;
    diagramsRef.current = seeded;
  }, [activeFile?.spec, isActiveFileLoading]);

  // Mount Excalidraw once the file fetch settles. Do not depend on `scene`:
  // a later PATCH refetch would remount the canvas and drop in-progress edits.
  useEffect(() => {
    if (isActiveFileLoading) return;
    let cancelled = false;
    const fileId = workspaceId;
    const scene = activeFile?.scene;
    void sceneToInitialData(scene).then((data) => {
      if (cancelled) return;
      const elements = Array.isArray((data as { elements?: unknown })?.elements)
        ? ((data as { elements: unknown[] }).elements as unknown[])
        : [];
      markSeeded(elements);
      setCanvasSeed({ fileId, data });
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, isActiveFileLoading, markSeeded]);

  const chat = useDiagramChat({
    fileId: workspaceId,
    diagramsRef,
    modelId: selectedModel,
    providerId: selectedProvider,
    persistTurn,
  });

  const { applyError, setApplyError } = useApplyDrawDiagram({
    messages: chat.messages,
    excalidrawAPI,
    isHistorySeeded,
    skippedMessageIdsRef,
    diagramsRef,
    projectId,
    fileId: workspaceId,
    onApplied: commitAppliedScene,
  });

  // Load chat once: thread if present, else the legacy `file.history` column
  // (and migrate that onto a thread). Those message ids are skipped by apply
  // so reloaded drawings are not painted a second time.
  useEffect(() => {
    if (!threadLoaded || isActiveFileLoading || isHistorySeeded) return;

    const stored =
      threadMessages !== null ? threadMessages : normalizeStoredChatHistory(activeFile?.history);

    const next = stored.map(storedChatMessageToUIMessage);
    chat.setMessages(next);
    skippedMessageIdsRef.current = new Set(next.map((message) => message.id));
    setIsHistorySeeded(true);

    if (threadMessages === null && next.length > 0) {
      void persistTurn(next);
    }
  }, [
    threadLoaded,
    threadMessages,
    isActiveFileLoading,
    isHistorySeeded,
    activeFile?.history,
    chat.setMessages,
    persistTurn,
  ]);

  // Landing-page handoff: `?init=true` plus a prompt stashed in localStorage.
  // Wait for history seed so `setMessages` cannot wipe this first send.
  useEffect(() => {
    if (!init || initTriggeredRef.current || !isHistorySeeded) return;

    const pendingPrompt = localStorage.getItem("pending_agent_prompt");
    const checkHandoff = async () => {
      let files: OfflinePendingFile[] | undefined = undefined;
      let hasFiles = false;

      try {
        const idbFiles = await getPendingFiles();
        if (idbFiles && idbFiles.length > 0) {
          files = idbFiles;
          hasFiles = true;
        }
      } catch (e) {
        console.error("Failed to read IndexedDB pending files", e);
      }

      const pendingFilesRaw = localStorage.getItem("pending_agent_files");
      if (!hasFiles && pendingFilesRaw) {
        try {
          files = JSON.parse(pendingFilesRaw) as OfflinePendingFile[];
          hasFiles = true;
        } catch (e) {
          console.error("Failed to parse pending files from localStorage", e);
        }
      }

      if (pendingPrompt !== null || hasFiles) {
        initTriggeredRef.current = true;
        localStorage.removeItem("pending_agent_prompt");
        localStorage.removeItem("pending_agent_files");
        void clearPendingFiles().catch(console.error);

        setIsAssistantMaximized(true);
        void navigate({
          search: (prev: any) => {
            const { init: _, ...rest } = prev;
            return rest;
          },
          replace: true,
        });

        void chat.sendMessage({ text: pendingPrompt || "", files });
      }
    };

    void checkHandoff();
  }, [init, isHistorySeeded, chat.sendMessage, navigate]);

  // Quota / credit / rate-limit are typed errors from `fetchDiagramChat`.
  useEffect(() => {
    if (!chat.error) return;

    if (chat.error instanceof CreationQuotaError) {
      toastManager.add({
        title: "Quota Exceeded",
        description: chat.error.message,
        variant: "warning",
      });
    } else if (chat.error instanceof UpstreamRateLimitError) {
      toastManager.add({
        title: "Rate Limited",
        description: chat.error.message,
        variant: "warning",
      });
    } else if (
      chat.error instanceof AiProviderCreditError ||
      chat.error?.name === "AiProviderCreditError"
    ) {
      toastManager.add({
        title: "Billing/Credit Issue",
        description: chat.error.message,
        variant: "error",
      });
    }
  }, [chat.error, toastManager]);

  const answerAskUser = (toolCallId: string, answer: string) => {
    chat.addToolOutput({ tool: "ask_user", toolCallId, output: answer });
  };

  const pendingAsk = pendingAskUser(chat.messages);

  // `ask_user` is a client tool: open the panel once per question so chips
  // are visible. The turn continues when the user answers via `addToolOutput`.
  useEffect(() => {
    if (!pendingAsk) {
      openedForAskRef.current = null;
      return;
    }
    if (openedForAskRef.current === pendingAsk.toolCallId) return;
    openedForAskRef.current = pendingAsk.toolCallId;
    setIsAssistantMaximized(true);
  }, [pendingAsk?.toolCallId]);

  const handleAssistantSubmit = () => {
    const text = assistantInput.trim();
    if (!text) return;
    setApplyError(null);

    const pending = pendingAskUser(chat.messages);
    if (pending) {
      answerAskUser(pending.toolCallId, text);
    } else {
      void chat.sendMessage({ text });
    }
    setAssistantInput("");
    setIsAssistantMaximized(true);
  };

  const handlePanelSubmit = (
    _e?: unknown,
    files?: { type: "file"; mediaType: string; filename: string; url: string }[],
  ) => {
    const text = assistantInput.trim();
    if (!text && (!files || files.length === 0)) return;
    setApplyError(null);

    const pending = pendingAskUser(chat.messages);
    if (pending) {
      answerAskUser(pending.toolCallId, text);
    } else {
      void chat.sendMessage({ text, files });
    }
    setAssistantInput("");
  };

  const lastUserMsgObj = [...chat.messages].reverse().find((m) => m.role === "user");
  const lastUserMessage = lastUserMsgObj
    ? lastUserMsgObj.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim()
    : undefined;

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
            <div className="flex items-center justify-between">
              <Link
                to="/App"
                className="p-1 hover:bg-gray-200/60 rounded-md transition text-gray-500 hover:text-gray-900 cursor-pointer shrink-0"
                title="Back to Dashboard"
              >
                <ArrowLeftIcon size={16} weight="bold" />
              </Link>
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className="p-1 hover:bg-gray-200/60 rounded-md transition text-gray-500 hover:text-gray-900 cursor-pointer shrink-0"
                title="Collapse Sidebar"
              >
                <SidebarSimpleIcon size={16} weight="bold" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderIcon size={14} className="text-gray-400 shrink-0" />
              {isProjectLoading ? (
                <div className="h-4 bg-gray-200 rounded animate-pulse w-32" />
              ) : (
                <h1 className="heading-font truncate text-[16px] text-gray-800 leading-normal">
                  {project?.name || "Project"}
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
              <button
                onClick={() => {
                  setNewFileName("");
                  setIsCreateFileOpen(true);
                }}
                className="p-1 hover:bg-gray-200/60 rounded-md transition text-gray-500 hover:text-gray-900 cursor-pointer shrink-0"
                title="Create New File"
              >
                <PlusIcon size={14} weight="bold" />
              </button>
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
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-normal transition cursor-pointer leading-none ${
                        isActive
                          ? "bg-gray-200/80 text-gray-900"
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

      {/* Canvas first so the glass assistant composites over the diagram. */}
      <div className="w-full h-full relative z-0 overflow-hidden bg-white">
        {canvasSeed && canvasSeed.fileId === workspaceId ? (
          <Whiteboard
            key={workspaceId}
            onAPIReady={setExcalidrawAPI}
            onChange={handleSceneChange}
            initialData={canvasSeed.data}
          />
        ) : (
          <div className="h-full w-full bg-gray-50 flex items-center justify-center">
            <span className="text-gray-400 text-sm font-medium animate-pulse">
              Loading canvas...
            </span>
          </div>
        )}
      </div>

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
          error={chat.error?.message ?? null}
          applyError={applyError}
          selectedModelId={
            selectedProvider && selectedModel ? `${selectedProvider}:${selectedModel}` : "platform"
          }
          onSelectModel={(mId, pId) => {
            setSelectedModel(mId);
            setSelectedProvider(pId);
          }}
        />
      ) : (
        <AssistantBar
          value={assistantInput}
          onChange={setAssistantInput}
          onMaximize={() => setIsAssistantMaximized(true)}
          onSubmit={handleAssistantSubmit}
          placeholder={lastUserMessage}
          pendingAsk={
            pendingAsk?.input?.question
              ? {
                  toolCallId: pendingAsk.toolCallId,
                  question: pendingAsk.input.question,
                  options: pendingAsk.input.options ?? [],
                }
              : null
          }
          onAnswerAskUser={answerAskUser}
        />
      )}

      {/* Create File Dialog */}
      <Dialog.Root open={isCreateFileOpen} onOpenChange={setIsCreateFileOpen}>
        <Dialog size="base">
          <div className="p-6 flex flex-col gap-4 font-geist">
            <DialogTitle className="text-base font-semibold text-gray-900">
              Create New File
            </DialogTitle>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">File Name</label>
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="e.g. architecture"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 transition"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">File Type</label>
              <Tabs
                tabs={[
                  {
                    value: "diagram",
                    className: "flex-1 justify-center",
                    label: (
                      <div className="flex items-center gap-2 py-1 px-4 text-xs font-semibold">
                        <ShapesIcon size={15} className="text-gray-500 shrink-0" />
                        <span>Diagram</span>
                      </div>
                    ),
                  },
                  {
                    value: "doc",
                    className: "flex-1 justify-center",
                    label: (
                      <div className="flex items-center gap-2 py-1 px-4 text-xs font-semibold">
                        <FileTextIcon size={15} className="text-gray-500 shrink-0" />
                        <span>Document</span>
                      </div>
                    ),
                  },
                ]}
                value={newFileType}
                onValueChange={(val) => setNewFileType(val as "diagram" | "doc")}
                size="base"
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <DialogClose render={<CustomButton text="Cancel" className="h-8" />} />
              <HeroButton
                text="Create"
                color="blue"
                onClick={handleCreateFile}
                disabled={!newFileName.trim()}
                className="h-8 py-0 text-xs shadow-none"
              />
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
