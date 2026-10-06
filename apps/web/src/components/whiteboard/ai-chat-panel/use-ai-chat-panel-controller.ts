import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThemeName } from "@OpenDiagram/harness";
import posthog from "posthog-js";
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
  pickerModelOptions,
  STANDARD_MODEL_OPTION,
  type ProviderModelOption,
} from "@/lib/settings-client";
import { isLikelyDiagramRequest } from "@/lib/workspace-agents";
import { toast } from "sonner";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { fileUIPartText, isTextFilePart } from "@/lib/pasted-text";
import type { AIChatPanelProps } from "./types";
import { parseInitialDiagramSpec, shouldUseDiagramChatDirectly } from "./types";
import { pendingAskUser } from "./utils";
import { useDiagramCanvas } from "./use-diagram-canvas";
import { useChatThread } from "./use-chat-thread";
import { useDiagramChat } from "./use-diagram-chat";
import { useProjectChat } from "./use-project-chat";

const PROJECT_CHAT_MAX_CHARS = 4_000;

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
  const [theme, setTheme] = useState<ThemeName>("sketch");
  // Picking a model is local state only. It rides along on the next request as
  // `providerId`/`modelId`; the saved default is changed from Settings, not here.
  const [providerId, setProviderId] = useState(
    initialProviderId && initialModelId
      ? `${initialProviderId}:${initialModelId}`
      : STANDARD_MODEL_OPTION.id,
  );
  const [providerOptions, setProviderOptions] = useState<ProviderModelOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void getAiSettings()
      .then((settings) => {
        if (!active) return;
        const options = pickerModelOptions(settings);
        setProviderOptions(options);
        setOptionsLoaded(true);
        // Standard arrives with no modelId, so match on what the URL carries.
        const initialOption = initialProviderId
          ? options.find(
              (option) =>
                option.providerId === initialProviderId && option.modelId === initialModelId,
            )
          : undefined;
        setProviderId(
          initialOption?.id ??
            options.find((option) => option.isDefault)?.id ??
            STANDARD_MODEL_OPTION.id,
        );
      })
      .catch(() => active && setOptionsLoaded(true));
    return () => {
      active = false;
    };
  }, [initialModelId, initialProviderId, projectId]);

  const selectedProvider = providerOptions.find((option) => option.id === providerId);
  // Until settings load, send the dashboard's pick from the URL. Sending nothing
  // let an auto-seeded first turn run on the saved default key, even when the
  // user had picked Standard.
  const requestModel = optionsLoaded
    ? { providerId: selectedProvider?.providerId, modelId: selectedProvider?.modelId }
    : { providerId: initialProviderId, modelId: initialModelId };
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
    onProviderError,
    onRateLimitError,
    onQuotaError,
    persistTurn: thread.persistTurn,
    threadId: thread.threadId,
    projectId,
    providerId: requestModel.providerId,
    modelId: requestModel.modelId,
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
    onProviderError,
    onRateLimitError,
    onQuotaError,
    projectId,
    providerId: requestModel.providerId,
    modelId: requestModel.modelId,
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
      const files = message.files.filter(isTextFilePart);
      const status = projectChat.status !== "ready" ? projectChat.status : diagramChat.status;
      if ((!text && files.length === 0) || (status !== "ready" && status !== "error")) return;
      // For the paths that take a plain string, not file parts: `ask_user`
      // answers, the doc chat route, and the diagram-or-doc routing regex.
      const inlined = [text, ...files.map(fileUIPartText)].filter(Boolean).join("\n\n");

      canvas.setApplyError(null);
      const track = (chatRoute: "diagram" | "project") =>
        posthog.capture("ai_chat_message_submitted", {
          file_type: activeFileType,
          chat_route: chatRoute,
        });
      const pending = pendingAskUser(diagramChat.messages);
      if (pending) {
        track("diagram");
        answerAskUser(pending.toolCallId, inlined);
        return;
      }

      const send = () => void diagramChat.sendMessage(text ? { text, files } : { files });
      if (useDiagramChatDirectly) {
        track("diagram");
        send();
        return;
      }

      // Routing is a local regex now, not a round trip to a model. It used to
      // await `POST /api/orchestrate` here, which put a Groq call in front of
      // every message on a doc file or a GitHub-imported diagram before the
      // user's text was sent anywhere.
      // Routed on what the user typed: a pasted document that mentions
      // "diagram" is context, not a request. A paste sent alone routes on itself.
      const useProjectChat = Boolean(projectId) && !isLikelyDiagramRequest(text || inlined);

      if (useProjectChat || !excalidrawAPI) {
        // The doc chat route caps a message at 4,000 characters (routes/projects/chat.ts).
        if (inlined.length > PROJECT_CHAT_MAX_CHARS) {
          toast.error(
            `Doc chat takes up to ${PROJECT_CHAT_MAX_CHARS.toLocaleString()} characters; this message is ${inlined.length.toLocaleString()}.`,
          );
          // Thrown, not returned: PromptInput keeps the composer's text and chips
          // when onSubmit rejects, so the message is not lost.
          throw new Error("message too long");
        }
        // `run` is a no-op without a project, so that path is not a submission.
        if (projectId) track("project");
        await projectChat.run(inlined);
      } else {
        track("diagram");
        send();
      }
    },
    [
      activeFileType,
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

  // The latest diagram with that title: a redraw replaces its frame, so titles
  // repeat only when the user asked for two diagrams of the same name.
  const showDiagram = useCallback(
    (title: string) => {
      if (!excalidrawAPI) return;
      const match = diagramsRef.current.findLast((diagram) => diagram.title === title);
      if (!match?.id) return;
      const elements = excalidrawAPI
        .getSceneElements()
        .filter((element) => element.id === match.id || element.frameId === match.id);
      if (elements.length > 0) {
        excalidrawAPI.scrollToContent(elements, { fitToContent: true, animate: true });
      }
    },
    [excalidrawAPI],
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
    // switch looked like a finished one that had simply changed nothing. A
    // toast, not `onProviderError`: that opens "Provider credits exhausted".
    resumeThread: (id: string) =>
      thread.resumeThread(id).catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : "Could not open that chat.");
      }),
    startNewThread: () =>
      thread.startNewThread().catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : "Could not start a new chat.");
      }),
    // Rethrown, unlike the two above: the rename and delete dialogs stay open
    // on failure so the user can retry, which needs the rejection.
    renameThread: (title: string) =>
      thread.renameThread(title).catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : "Could not rename that chat.");
        throw cause;
      }),
    deleteCurrentThread: () =>
      thread.deleteCurrentThread().catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : "Could not delete that chat.");
        throw cause;
      }),
    threadId: thread.threadId,
    threadSwitching: thread.isSwitching,
    threadTitle: thread.title,
    threads: thread.threads,
    applyError: canvas.applyError,
    conversationMessages,
    diagramError: diagramChat.error,
    // `regenerate` resends the same user message id, so `turnIdFor` on the server
    // keeps the retry on the credit the failed turn already took.
    retry: () => void diagramChat.regenerate(),
    // Straight to diagram chat: on a repo-generated canvas `handleSubmit` routes
    // by regex, and two of the starters do not read as diagram requests to it.
    sendStarter: (text: string) => {
      canvas.setApplyError(null);
      void diagramChat.sendMessage({ text });
    },
    showDiagram,
    diagramStatus: diagramChat.status,
    handleSubmit,
    projectError: projectChat.error,
    projectStatus: projectChat.status,
    providerId,
    providerOptions,
    setProviderId,
    setTheme,
    stop,
    submitStatus,
    theme,
  };
}
