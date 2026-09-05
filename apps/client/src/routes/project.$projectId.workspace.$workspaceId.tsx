import {
  useState,
  useRef,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { projectFileQueryOptions } from "#/lib/api";
import { useApplyDrawDiagram } from "#/hooks/useApplyDrawDiagram";
import { useDiagramChat, type DiagramChatAttachment } from "#/hooks/useDiagramChatContext";
import { useSceneAutosave } from "#/hooks/useSceneAutosave";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Whiteboard } from "#/components/whiteboard/Whiteboard";
import { AssistantBar } from "#/components/workspace/AssistantBar";
import { AssistantPanel } from "#/components/workspace/AssistantPanel";
import { DiagramChatProvider } from "#/components/workspace/DiagramChatProvider";
import { fitSceneToViewport, sceneToInitialData } from "#/lib/utils/excalidraw-utils";
import { parseCanvasDiagrams, type CanvasDiagram } from "#/lib/utils/canvas-diagrams";

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
  const [selectedModel, setSelectedModel] = useState<string | null>(searchModelId || null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(searchProviderId || null);
  const [isAssistantMaximized, setIsAssistantMaximized] = useState(false);
  const diagramsRef = useRef<CanvasDiagram[]>([]);
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <DiagramChatProvider
      projectId={projectId}
      fileId={workspaceId}
      diagramsRef={diagramsRef}
      modelId={selectedModel}
      providerId={selectedProvider}
      init={init}
      onClearInit={() =>
        navigate({
          search: (prev) => {
            const { init: _, ...rest } = prev;
            return rest;
          },
          replace: true,
        })
      }
      onInitHandoff={() => setIsAssistantMaximized(true)}
    >
      <WorkspaceChatChrome
        projectId={projectId}
        workspaceId={workspaceId}
        diagramsRef={diagramsRef}
        selectedModel={selectedModel}
        selectedProvider={selectedProvider}
        onSelectModel={(mId, pId) => {
          setSelectedModel(mId);
          setSelectedProvider(pId);
        }}
        isAssistantMaximized={isAssistantMaximized}
        setIsAssistantMaximized={setIsAssistantMaximized}
      />
    </DiagramChatProvider>
  );
}

function WorkspaceChatChrome({
  projectId,
  workspaceId,
  diagramsRef,
  selectedModel,
  selectedProvider,
  onSelectModel,
  isAssistantMaximized,
  setIsAssistantMaximized,
}: {
  projectId: string;
  workspaceId: string;
  diagramsRef: RefObject<CanvasDiagram[]>;
  selectedModel: string | null;
  selectedProvider: string | null;
  onSelectModel: (modelId: string | null, providerId: string | null) => void;
  isAssistantMaximized: boolean;
  setIsAssistantMaximized: Dispatch<SetStateAction<boolean>>;
}) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [canvasSeed, setCanvasSeed] = useState<{ fileId: string; data: unknown } | null>(null);
  const openedForAskRef = useRef<string | null>(null);

  const {
    messages,
    error,
    isHistorySeeded,
    skippedMessageIdsRef,
    pendingAsk,
    answerAskUser,
    input,
    setInput,
    submitText,
    submitWithFiles,
    lastUserMessage,
    isLoading,
  } = useDiagramChat();

  const { data: activeFile, isLoading: isActiveFileLoading } = useQuery(
    projectFileQueryOptions(projectId, workspaceId),
  );

  const { handleSceneChange, markSeeded, commitAppliedScene } = useSceneAutosave(
    projectId,
    workspaceId,
  );

  const { applyError, setApplyError } = useApplyDrawDiagram({
    messages,
    excalidrawAPI,
    isHistorySeeded,
    skippedMessageIdsRef,
    diagramsRef,
    projectId,
    fileId: workspaceId,
    onApplied: commitAppliedScene,
  });

  // File switch: wipe per-file UI state. Chat/apply/autosave reset themselves
  // from `fileId`. Canvas remounts via `Whiteboard key={workspaceId}`.
  useEffect(() => {
    diagramsRef.current = [];
    setCanvasSeed(null);
    openedForAskRef.current = null;
    setExcalidrawAPI(null);
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

  // Always fit on first paint. Saved scrollX/scrollY are Excalidraw defaults or
  // a snapshot taken before the generate pan finished, so they are not a camera.
  useEffect(() => {
    if (!excalidrawAPI || !canvasSeed) return;

    const elements = (canvasSeed.data as { elements?: unknown[] } | null)?.elements;
    if (!elements || elements.length === 0) return;

    const frame = window.requestAnimationFrame(() => {
      fitSceneToViewport(excalidrawAPI, elements);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [excalidrawAPI, canvasSeed]);

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

  const handlePanelSubmit = (_e?: unknown, files?: DiagramChatAttachment[]) => {
    setApplyError(null);
    submitWithFiles(files);
  };

  const handleBarSubmit = () => {
    setApplyError(null);
    submitText();
    setIsAssistantMaximized(true);
  };

  return (
    <div className="relative h-screen w-screen bg-white overflow-hidden font-geist">
      {/* Floating Back to Dashboard Button */}
      <div className="absolute left-4 top-4 z-50 flex items-center justify-center">
        <Link
          to="/app"
          className="p-2 bg-white/80 backdrop-blur-md border border-gray-200 rounded-xl shadow-md text-gray-500 hover:text-gray-900 hover:bg-white transition cursor-pointer flex items-center justify-center"
          title="Back to Dashboard"
        >
          <ArrowLeftIcon size={18} weight="bold" />
        </Link>
      </div>

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
          messages={messages}
          input={input}
          handleInputChange={(e) => setInput(e.target.value)}
          handleSubmit={handlePanelSubmit}
          setInput={setInput}
          onClose={() => setIsAssistantMaximized(false)}
          isLoading={isLoading}
          onAnswerAskUser={answerAskUser}
          error={error?.message ?? null}
          applyError={applyError}
          selectedModelId={
            selectedProvider && selectedModel ? `${selectedProvider}:${selectedModel}` : "platform"
          }
          onSelectModel={onSelectModel}
        />
      ) : (
        <AssistantBar
          value={input}
          onChange={setInput}
          onMaximize={() => setIsAssistantMaximized(true)}
          onSubmit={handleBarSubmit}
          placeholder={lastUserMessage}
          pendingAsk={
            pendingAsk?.input.question
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
    </div>
  );
}
