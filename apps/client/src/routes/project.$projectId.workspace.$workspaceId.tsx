import { useState, useRef, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import {
  projectQueryOptions,
  projectFileQueryOptions,
  projectFilesQueryOptions,
  updateProjectFile,
  createProjectFile,
} from "#/lib/api";
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
import {
  applyDiagramToCanvas,
  sanitizeSceneAppState,
  sceneElementsVersion,
  sceneToInitialData,
} from "#/lib/utils/excalidraw-utils";
import {
  parseCanvasDiagrams,
  upsertCanvasDiagram,
  toPromptDiagrams,
  type CanvasDiagram,
} from "#/lib/utils/canvas-diagrams";
import {
  fetchDiagramChat,
  isDrawDiagramPart,
  pendingAskUser,
  stripDrawDiagramOutput,
  type DrawDiagramInput,
  type DrawDiagramOutput,
} from "#/lib/utils/diagram-chat";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "";
const SCENE_AUTOSAVE_MS = 2000;

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

  const selectedModelRef = useRef<string | null>(searchModelId || null);
  const selectedProviderRef = useRef<string | null>(searchProviderId || null);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    selectedProviderRef.current = selectedProvider;
  }, [selectedProvider]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAssistantMaximized, setIsAssistantMaximized] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [canvasSeed, setCanvasSeed] = useState<{ fileId: string; data: unknown } | null>(null);
  const [isHistorySeeded, setIsHistorySeeded] = useState(false);
  const lastMessagesCountRef = useRef(0);
  const initTriggeredRef = useRef(false);

  const navigate = useNavigate();
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

  const lastSavedSceneVersionRef = useRef("");
  const pendingSceneRef = useRef<unknown>(null);
  const sceneSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneSaveInFlightRef = useRef(false);

  // Seed the canvas once per file. Do not depend on activeFile identity —
  // a refetch after autosave must not remount Excalidraw and wipe the scene.
  useEffect(() => {
    setCanvasSeed(null);
    lastSavedSceneVersionRef.current = "";
    pendingSceneRef.current = null;
    setIsHistorySeeded(false);
    initTriggeredRef.current = false;
    if (sceneSaveTimerRef.current) {
      clearTimeout(sceneSaveTimerRef.current);
      sceneSaveTimerRef.current = null;
    }
  }, [workspaceId]);

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
      lastSavedSceneVersionRef.current = sceneElementsVersion(elements);
      setCanvasSeed({ fileId, data });
    });
    return () => {
      cancelled = true;
    };
    // Seed once the file fetch settles. Do not list `scene` — a later PATCH
    // refetch would remount the canvas and drop in-progress edits.
  }, [workspaceId, isActiveFileLoading]);

  // Vercel AI SDK useChat Hook with custom transport
  const transport = useRef<DefaultChatTransport<any> | null>(null);
  if (!transport.current) {
    transport.current = new DefaultChatTransport<any>({
      api: `${SERVER_URL.replace(/\/$/, "")}/api/diagram/chat`,
      body: () => ({
        diagrams: toPromptDiagrams(diagramsRef.current),
        theme: "sketch",
        modelId: selectedModelRef.current || undefined,
        providerId: selectedProviderRef.current || undefined,
      }),
      prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
        body: { ...body, id, messages: stripDrawDiagramOutput(messages), trigger, messageId },
      }),
      fetch: fetchDiagramChat as typeof fetch,
    });
  }

  const chat = useChat({
    transport: transport.current,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
  // 1. Seed chat messages from activeFile history when activeFile finishes loading.
  useEffect(() => {
    if (!activeFile || isHistorySeeded) return;
    setIsHistorySeeded(true);

    if (activeFile.history && activeFile.history.length > 0) {
      chat.setMessages(activeFile.history);
      lastMessagesCountRef.current = activeFile.history.length;
    } else {
      chat.setMessages([]);
      lastMessagesCountRef.current = 0;
    }
  }, [activeFile, isHistorySeeded, chat.setMessages]);

  // 2. Persist chat messages to backend when chat is not loading and the number of messages changes.
  useEffect(() => {
    const isChatLoading = chat.status === "streaming" || chat.status === "submitted";
    if (chat.messages.length === 0 || isChatLoading) return;
    if (chat.messages.length === lastMessagesCountRef.current) return;
    lastMessagesCountRef.current = chat.messages.length;

    void updateProjectFile(projectId, workspaceId, {
      history: chat.messages,
    }).catch(console.error);
  }, [chat.messages, chat.status, projectId, workspaceId]);

  // 3. Trigger initial prompt if redirecting from App.tsx.
  useEffect(() => {
    if (!init || initTriggeredRef.current || !isHistorySeeded) return;

    const pendingPrompt = localStorage.getItem("pending_agent_prompt");
    const pendingFilesRaw = localStorage.getItem("pending_agent_files");
    if (pendingPrompt) {
      initTriggeredRef.current = true;
      localStorage.removeItem("pending_agent_prompt");
      localStorage.removeItem("pending_agent_files");
      void navigate({ search: {}, replace: true });

      let files = undefined;
      if (pendingFilesRaw) {
        try {
          files = JSON.parse(pendingFilesRaw) as {
            type: "file";
            mediaType: string;
            filename: string;
            url: string;
          }[];
        } catch (e) {
          console.error("Failed to parse pending files from localStorage", e);
        }
      }

      void chat.sendMessage({ text: pendingPrompt, files });
    }
  }, [init, isHistorySeeded, chat.sendMessage, navigate]);

  const appliedToolCallsRef = useRef(new Set<string>());
  const applyChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    appliedToolCallsRef.current.clear();
    applyChainRef.current = Promise.resolve();
    setApplyError(null);
  }, [workspaceId]);

  // Hook errors from diagram chat and notify the user via toasts
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

  // Apply completed draw_diagram tool outputs onto the canvas, in order.
  useEffect(() => {
    if (!excalidrawAPI) return;

    for (const message of chat.messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.parts) {
        if (!isDrawDiagramPart(part) || part.state !== "output-available") continue;
        if (appliedToolCallsRef.current.has(part.toolCallId)) continue;

        const output = part.output as DrawDiagramOutput | undefined;
        const skeletons = output?.skeletons;
        if (!skeletons) continue;

        appliedToolCallsRef.current.add(part.toolCallId);
        const { targetId, ...spec } = (part.input ?? {}) as DrawDiagramInput;

        const replaceFrameId =
          targetId && diagramsRef.current.some((d) => d.id === targetId) ? targetId : null;

        applyChainRef.current = applyChainRef.current.then(async () => {
          try {
            const { frameId } = await applyDiagramToCanvas(
              excalidrawAPI,
              skeletons,
              output.rawElements || [],
              { replaceFrameId },
            );

            if (!frameId) return;

            const base = replaceFrameId
              ? diagramsRef.current.filter((d) => d.id !== replaceFrameId)
              : diagramsRef.current;

            const updated = upsertCanvasDiagram(base, {
              id: frameId,
              title: spec.title || "Untitled",
              spec,
            });

            diagramsRef.current = updated;
            setApplyError(null);

            const scene = {
              elements: excalidrawAPI.getSceneElements(),
              appState: sanitizeSceneAppState(excalidrawAPI.getAppState()),
              files: excalidrawAPI.getFiles?.() ?? {},
            };
            lastSavedSceneVersionRef.current = sceneElementsVersion(scene.elements);
            pendingSceneRef.current = null;
            if (sceneSaveTimerRef.current) {
              clearTimeout(sceneSaveTimerRef.current);
              sceneSaveTimerRef.current = null;
            }

            await updateProjectFile(projectId, workspaceId, {
              spec: { diagrams: updated } as never,
              scene: scene as never,
            });
            queryClient.invalidateQueries({
              queryKey: ["projects", projectId, "files", workspaceId],
            });
          } catch (err) {
            appliedToolCallsRef.current.delete(part.toolCallId);
            setApplyError(err instanceof Error ? err.message : "Failed to draw on canvas");
          }
        });
      }
    }
  }, [chat.messages, excalidrawAPI, projectId, workspaceId, queryClient]);

  const flushSceneSave = () => {
    const scene = pendingSceneRef.current;
    if (!scene || sceneSaveInFlightRef.current) return;
    sceneSaveInFlightRef.current = true;
    pendingSceneRef.current = null;
    void updateProjectFile(projectId, workspaceId, { scene: scene as never })
      .catch(() => {
        pendingSceneRef.current = scene;
      })
      .finally(() => {
        sceneSaveInFlightRef.current = false;
        if (pendingSceneRef.current) flushSceneSave();
      });
  };

  const handleSceneChange = (elements: readonly unknown[], appState: unknown, files: unknown) => {
    const version = sceneElementsVersion(elements);
    if (version === lastSavedSceneVersionRef.current) return;
    lastSavedSceneVersionRef.current = version;
    pendingSceneRef.current = {
      elements,
      appState: sanitizeSceneAppState(appState),
      files,
    };
    if (sceneSaveTimerRef.current) return;
    sceneSaveTimerRef.current = setTimeout(() => {
      sceneSaveTimerRef.current = null;
      flushSceneSave();
    }, SCENE_AUTOSAVE_MS);
  };

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (sceneSaveTimerRef.current) {
        clearTimeout(sceneSaveTimerRef.current);
        sceneSaveTimerRef.current = null;
      }
      flushSceneSave();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [projectId, workspaceId]);

  const answerAskUser = (toolCallId: string, answer: string) => {
    chat.addToolOutput({ tool: "ask_user", toolCallId, output: answer });
  };

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

      {/* AI Assistant Overlay/Bar */}
      {isAssistantMaximized ? (
        <AssistantPanel
          messages={chat.messages}
          input={assistantInput}
          handleInputChange={(e) => setAssistantInput(e.target.value)}
          handleSubmit={handlePanelSubmit}
          setInput={setAssistantInput}
          onClose={() => setIsSidebarCollapsed(true)}
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
        />
      )}

      {/* Main Canvas Area */}
      <div className="w-full h-full relative overflow-hidden bg-white">
        {canvasSeed?.fileId === workspaceId ? (
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
