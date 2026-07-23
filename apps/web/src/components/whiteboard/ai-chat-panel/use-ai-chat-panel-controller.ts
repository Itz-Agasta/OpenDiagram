import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiagramSpec, ThemeName } from "@OpenDiagram/harness";
import { normalizeStoredChatHistory, storedChatMessageToUIMessage } from "@/lib/chat-history";
import {
  getAiSettings,
  providerModelOptions,
  selectProviderModel,
  type ProviderModelOption,
} from "@/lib/settings-client";
import { orchestrateWorkspaceRequest } from "@/lib/workspace-agents";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { AIChatPanelProps, AIChatProviderOption } from "./types";
import { parseInitialDiagramSpec, shouldUseDiagramChatDirectly } from "./types";
import { diagramRequestLikely, pendingAskUser } from "./utils";
import { useDiagramCanvas } from "./use-diagram-canvas";
import { useDiagramChat } from "./use-diagram-chat";
import { useProjectChat } from "./use-project-chat";

export function useAIChatPanelController({
  activeFileType,
  allowSeedAutoRun = true,
  excalidrawAPI,
  fileId,
  hasExistingScene,
  initialHistory,
  initialModelId,
  initialSpec,
  initialProviderId,
  onHistoryChange,
  onProviderError,
  onRateLimitError,
  onQuotaError,
  projectId,
}: AIChatPanelProps) {
  const parsedInitialSpec = useMemo(() => parseInitialDiagramSpec(initialSpec), [initialSpec]);
  const useDiagramChatDirectly = shouldUseDiagramChatDirectly(activeFileType, initialSpec);
  const normalizedHistory = useMemo(
    () => normalizeStoredChatHistory(initialHistory),
    [initialHistory],
  );
  const currentSpecRef = useRef<DiagramSpec | undefined>(parsedInitialSpec);
  const [theme, setTheme] = useState<ThemeName>("sketch");
  const [providerUsage, setProviderUsage] = useState<AiProviderUsage | null>(null);
  const [providerId, setProviderIdState] = useState(
    initialProviderId && initialModelId ? `${initialProviderId}:${initialModelId}` : "platform",
  );
  const [providerOptions, setProviderOptions] = useState<AIChatProviderOption[]>([]);
  const providerOptionsRef = useRef<ProviderModelOption[]>([]);
  const providerUpdateRef = useRef<Promise<void>>(Promise.resolve());
  const providerUpdateFailedRef = useRef(false);
  const providerIdRef = useRef(providerId);
  const providerRequestIdRef = useRef(0);
  const routingRef = useRef(false);
  const [routingPending, setRoutingPending] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void getAiSettings()
      .then((settings) => {
        if (!active) return;
        const options = providerModelOptions(settings);
        providerOptionsRef.current = options;
        setProviderOptions(options);
        const initialOption =
          initialProviderId && initialModelId
            ? options.find(
                (option) =>
                  option.providerId === initialProviderId && option.modelId === initialModelId,
              )
            : undefined;
        const nextProviderId =
          initialOption?.id ?? options.find((option) => option.isDefault)?.id ?? "platform";
        providerIdRef.current = nextProviderId;
        setProviderIdState(nextProviderId);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initialModelId, initialProviderId, projectId]);

  const selectedProvider = providerOptions.find((option) => option.id === providerId);

  const setProviderId = useCallback(
    (nextProviderId: string) => {
      const option = providerOptionsRef.current.find(
        (candidate) => candidate.id === nextProviderId,
      );
      if (!option) return;

      const requestId = ++providerRequestIdRef.current;
      const previousProviderId = providerIdRef.current;
      providerIdRef.current = nextProviderId;
      setProviderIdState(nextProviderId);
      providerUpdateFailedRef.current = false;
      const request = providerUpdateRef.current
        .catch(() => undefined)
        .then(() => selectProviderModel(option));
      providerUpdateRef.current = request.catch(() => undefined);
      void request.catch((cause) => {
        if (requestId !== providerRequestIdRef.current) return;
        providerUpdateFailedRef.current = true;
        providerIdRef.current = previousProviderId;
        setProviderIdState(previousProviderId);
        onProviderError?.(
          cause instanceof Error ? cause.message : "Could not select this provider.",
        );
      });
    },
    [onProviderError],
  );
  const autoDiagramPrompt =
    activeFileType === "diagram"
      ? normalizedHistory.find((message) => message.role === "user")
      : undefined;
  const diagramChat = useDiagramChat({
    activeFileType,
    allowSeedAutoRun,
    autoDiagramPrompt,
    currentSpecRef,
    excalidrawAPI,
    fileId,
    hasExistingScene,
    normalizedHistory,
    onHistoryChange,
    onProviderUsage: setProviderUsage,
    onProviderError,
    onRateLimitError,
    onQuotaError,
    projectId,
    providerId: selectedProvider?.providerId,
    modelId: selectedProvider?.modelId,
    theme,
  });
  const canvas = useDiagramCanvas({
    currentSpecRef,
    diagramMessages: diagramChat.messages,
    excalidrawAPI,
    fileId,
    initialSpec: parsedInitialSpec,
    projectId,
  });
  const projectChat = useProjectChat({
    activeFileType,
    fileId,
    normalizedHistory,
    onHistoryChange,
    onProviderUsage: setProviderUsage,
    onProviderError,
    onRateLimitError,
    onQuotaError,
    projectId,
    providerId: selectedProvider?.providerId,
    modelId: selectedProvider?.modelId,
    setDiagramMessages: diagramChat.setMessages,
  });

  const answerAskUser = useCallback(
    (toolCallId: string, answer: string) => {
      diagramChat.addToolOutput({ tool: "ask_user", toolCallId, output: answer });
    },
    [diagramChat.addToolOutput],
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text.trim();
      const status = projectChat.status !== "ready" ? projectChat.status : diagramChat.status;
      if (!text || (status !== "ready" && status !== "error")) return;

      await providerUpdateRef.current;
      if (providerUpdateFailedRef.current) return;

      canvas.setApplyError(null);
      const pending = pendingAskUser(diagramChat.messages);
      if (pending) {
        answerAskUser(pending.toolCallId, text);
        return;
      }

      if (useDiagramChatDirectly) {
        void diagramChat.sendMessage({ text });
        return;
      }

      let useProjectChat = Boolean(projectId) && !diagramRequestLikely(text);
      if (projectId && excalidrawAPI) {
        if (routingRef.current) return;
        routingRef.current = true;
        setRoutingPending(true);
        try {
          const route = await orchestrateWorkspaceRequest({ text, projectId });
          useProjectChat = route.intent === "project_chat";
        } catch {
          useProjectChat = !diagramRequestLikely(text);
        } finally {
          routingRef.current = false;
          setRoutingPending(false);
        }
      }

      if (useProjectChat || !excalidrawAPI) {
        await projectChat.run(text);
      } else {
        void diagramChat.sendMessage({ text });
      }
    },
    [
      answerAskUser,
      canvas.setApplyError,
      diagramChat.messages,
      diagramChat.sendMessage,
      diagramChat.status,
      excalidrawAPI,
      projectChat.run,
      projectChat.status,
      projectId,
      routingPending,
      useDiagramChatDirectly,
    ],
  );

  const submitStatus = routingPending
    ? "submitted"
    : projectChat.status !== "ready"
      ? projectChat.status
      : diagramChat.status;
  const stop = useCallback(() => {
    if (projectChat.status !== "ready") projectChat.stop();
    else diagramChat.stop();
  }, [diagramChat.stop, projectChat.status, projectChat.stop]);
  const conversationMessages =
    activeFileType === "diagram"
      ? diagramChat.messages
      : [...projectChat.messages.map(storedChatMessageToUIMessage), ...diagramChat.messages];

  return {
    answerAskUser,
    applyError: canvas.applyError,
    conversationMessages,
    diagramError: diagramChat.error,
    diagramStatus: diagramChat.status,
    handleSubmit,
    projectError: projectChat.error,
    projectStatus: projectChat.status,
    providerUsage,
    providerId,
    providerOptions,
    setProviderId,
    setTheme,
    stop,
    submitStatus,
    theme,
  };
}
