import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThemeName } from "@OpenDiagram/harness";
import {
  parseCanvasDiagrams,
  serializeCanvasDiagrams,
  type CanvasDiagram,
} from "@/lib/canvas-diagrams";
import { queueProjectFilePatch } from "@/lib/project-file-sync";
import {
  normalizeStoredChatHistory,
  storedChatMessageToUIMessage,
  type StoredChatMessage,
} from "@/lib/chat-history";
import {
  getAiSettings,
  providerModelOptions,
  selectProviderModel,
  type ProviderModelOption,
} from "@/lib/settings-client";
import { isLikelyDiagramRequest } from "@/lib/workspace-agents";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { AIChatPanelProps, AIChatProviderOption } from "./types";
import { parseInitialDiagramSpec, shouldUseDiagramChatDirectly } from "./types";
import { pendingAskUser } from "./utils";
import { useDiagramCanvas } from "./use-diagram-canvas";
import { useChatThread } from "./use-chat-thread";
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
  // Messages now arrive from the thread rather than as an `initialHistory` prop.
  // The prop is still read once, so an IndexedDB paint upstream still shows before
  // the thread request lands.
  const [threadMessages, setThreadMessages] = useState<StoredChatMessage[] | null>(null);
  const thread = useChatThread({ projectId, fileId, onMessagesLoaded: setThreadMessages });

  // Every diagram on this canvas, read from the FILE rather than the thread.
  //
  // The thread used to own a single `spec` and a single `frame_id`, which is why
  // drawing a second subject destroyed the first: one column, several diagrams.
  // They belong to the canvas, so they live on the file and survive "New chat" --
  // the drawings are still on screen after starting a new conversation, so the
  // next conversation has to be able to see them.
  const [diagrams, setDiagrams] = useState<CanvasDiagram[]>([]);
  const diagramsRef = useRef(diagrams);

  // Seeded only while the list is still empty. `initialSpec` arrives with the
  // file fetch, which lands after the panel has mounted and possibly after a
  // diagram has already been drawn -- re-seeding then would discard it.
  useEffect(() => {
    if (diagramsRef.current.length > 0) return;
    const seeded = parseCanvasDiagrams(initialSpec);
    if (seeded.length === 0) {
      // Files written before the list existed hold one bare spec.
      const legacy = parseInitialDiagramSpec(initialSpec);
      if (!legacy) return;
      seeded.push({ id: "", title: legacy.title, spec: legacy });
    }
    diagramsRef.current = seeded;
    setDiagrams(seeded);
  }, [initialSpec]);

  const useDiagramChatDirectly = shouldUseDiagramChatDirectly(activeFileType, initialSpec);
  const normalizedHistory = useMemo(
    () => normalizeStoredChatHistory(threadMessages ?? initialHistory),
    [threadMessages, initialHistory],
  );

  const handleDiagramsChange = useCallback(
    (next: CanvasDiagram[]) => {
      diagramsRef.current = next;
      setDiagrams(next);
      if (!projectId || !fileId) return;
      // Through the shared queue, so this coalesces with the canvas autosave
      // instead of racing it on the same row. `meta` because nothing here reads
      // the response -- the client already holds what it just wrote.
      void queueProjectFilePatch(
        projectId,
        fileId,
        { spec: serializeCanvasDiagrams(next) },
        "meta",
      ).catch(() => undefined);
    },
    [fileId, projectId],
  );
  // True only between accepting a submit and the model actually starting, which
  // is a gap the chat status cannot see. Gates the thread controls.
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    diagramsRef,
    excalidrawAPI,
    fileId,
    hasExistingScene,
    normalizedHistory,
    onHistoryChange,
    onProviderUsage: setProviderUsage,
    onProviderError,
    onRateLimitError,
    onQuotaError,
    persistTurn: thread.persistTurn,
    threadId: thread.threadId,
    projectId,
    providerId: selectedProvider?.providerId,
    modelId: selectedProvider?.modelId,
    theme,
  });
  const canvas = useDiagramCanvas({
    diagrams,
    onDiagramsChange: handleDiagramsChange,
    diagramMessages: diagramChat.messages,
    excalidrawAPI,
    fileId,
    projectId,
  });

  // Files written before the diagram list existed recorded a spec but no frame
  // id, so their one diagram cannot be targeted and the first modification would
  // draw a duplicate beside it. The frame is right there on the canvas: when
  // there is exactly one of each, they are unambiguously the same diagram.
  //
  // Through `handleDiagramsChange`, not `setDiagrams`, so the repair is WRITTEN
  // to the file. In state only it was redone every load, and until it had run
  // `toPromptDiagrams` dropped the entry for having an empty id -- so a message
  // sent before `excalidrawAPI` arrived told the model the canvas was empty.
  useEffect(() => {
    if (!excalidrawAPI) return;
    const current = diagramsRef.current;
    if (current.length !== 1 || current[0]!.id !== "") return;
    const frames = excalidrawAPI.getSceneElements().filter((element) => element.type === "frame");
    if (frames.length !== 1) return;
    handleDiagramsChange([{ ...current[0]!, id: frames[0]!.id }]);
  }, [excalidrawAPI, diagrams, handleDiagramsChange]);
  const projectChat = useProjectChat({
    activeFileType,
    diagramMessages: diagramChat.messages,
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

      // Held across the provider await below. Until `sendMessage` runs, neither
      // chat's status has moved off `ready`, so the thread controls would still
      // be live -- and a switch inside that window files this turn under the
      // conversation the user moved to instead of the one they typed into.
      setIsSubmitting(true);
      try {
        await providerUpdateRef.current;
      } finally {
        setIsSubmitting(false);
      }
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

      // Routing is a local regex now, not a round trip to a model. It used to
      // await `POST /api/orchestrate` here, which put a Groq call in front of
      // every message on a doc file or a GitHub-imported diagram before the
      // user's text was sent anywhere.
      const useProjectChat = Boolean(projectId) && !isLikelyDiagramRequest(text);

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
      useDiagramChatDirectly,
    ],
  );

  const submitStatus = projectChat.status !== "ready" ? projectChat.status : diagramChat.status;
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
    loadThreadList: thread.loadThreadList,
    // Surfaced, not swallowed: `isSwitching` clears either way, so a failed
    // switch looked like a finished one that had simply changed nothing.
    resumeThread: (id: string) =>
      thread.resumeThread(id).catch((cause: unknown) => {
        onProviderError?.(cause instanceof Error ? cause.message : "Could not open that chat.");
      }),
    startNewThread: () =>
      thread.startNewThread().catch((cause: unknown) => {
        onProviderError?.(cause instanceof Error ? cause.message : "Could not start a new chat.");
      }),
    threadSwitching: thread.isSwitching || isSubmitting,
    threads: thread.threads,
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
