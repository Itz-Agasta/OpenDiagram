import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import type { RefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ThemeName } from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/web";
import { toPromptDiagrams, type CanvasDiagram } from "@/lib/canvas-diagrams";
import { readAiProviderUsage, type AiProviderUsage } from "@/lib/ai-provider-usage";
import {
  storedChatMessageToUIMessage,
  uiMessagesToStoredChatHistory,
  uiMessageText,
  type StoredChatMessage,
} from "@/lib/chat-history";
import {
  AiProviderCreditError,
  CreationQuotaError,
  UpstreamRateLimitError,
} from "@/lib/projects-client";
import { fetchDiagramChat, stripDrawDiagramOutput } from "./utils";

interface UseDiagramChatOptions {
  activeFileType?: "diagram" | "doc";
  allowSeedAutoRun: boolean;
  autoDiagramPrompt?: StoredChatMessage;
  /** Every diagram on the canvas, mirrored so the transport body reads it lazily. */
  diagramsRef: RefObject<CanvasDiagram[]>;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  fileId?: string;
  hasExistingScene?: boolean;
  normalizedHistory: StoredChatMessage[];
  onHistoryChange?: (history: StoredChatMessage[]) => void;
  persistTurn: (messages: UIMessage[], spec?: unknown) => Promise<void>;
  /** Part of the seed key: when a thread arrives it supersedes any legacy history. */
  threadId: string | null;
  onProviderUsage: (usage: AiProviderUsage | null) => void;
  onProviderError?: (message: string) => void;
  onRateLimitError?: (message: string) => void;
  onQuotaError?: (message: string) => void;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  theme: ThemeName;
}

export function useDiagramChat(options: UseDiagramChatOptions) {
  const {
    activeFileType,
    allowSeedAutoRun,
    autoDiagramPrompt,
    diagramsRef,
    excalidrawAPI,
    fileId,
    hasExistingScene,
    normalizedHistory,
    onHistoryChange,
    persistTurn,
    threadId,
    onProviderUsage,
    onProviderError,
    onRateLimitError,
    onQuotaError,
    projectId,
    providerId,
    modelId,
    theme,
  } = options;
  const seedAutoRunKeyRef = useRef<string | null>(null);
  const seedStorageKeyRef = useRef<string | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const chatFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      onProviderUsage(null);
      const response = await fetchDiagramChat(input, init);
      onProviderUsage(readAiProviderUsage(response));
      return response;
    },
    [onProviderUsage],
  );
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${env.NEXT_PUBLIC_SERVER_URL}/api/diagram/chat`,
        // Every diagram on the canvas, so the model can be asked to modify any of
        // them and not just the one it drew last. Read through a ref because the
        // canvas reports a new diagram from inside a promise chain that resolves
        // after this render.
        body: () => ({
          diagrams: toPromptDiagrams(diagramsRef.current),
          modelId,
          providerId,
          theme: themeRef.current,
        }),
        // Returning a body REPLACES the transport's default one rather than
        // merging into it, so `id`, `trigger` and `messageId` have to be carried
        // through by hand -- dropping them silently changes what the SDK tells the
        // server about why this request was made. `body` arrives already merged
        // with the callback above.
        prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
          body: { ...body, id, messages: stripDrawDiagramOutput(messages), trigger, messageId },
        }),
        fetch: chatFetch,
      }),
    [chatFetch, diagramsRef, modelId, providerId],
  );
  const initialMessages =
    activeFileType === "diagram" ? normalizedHistory.map(storedChatMessageToUIMessage) : [];
  const chat = useChat({
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ messages }) => {
      onHistoryChange?.(uiMessagesToStoredChatHistory(messages));
      // Only what this turn added. The diagrams themselves are written separately,
      // to the file rather than the thread, because they belong to the canvas and
      // have to survive "New chat".
      void persistTurn(messages);
    },
  });

  // Seeding the panel from stored history is now a two-stage arrival -- IndexedDB
  // answers in about a millisecond, the server copy lands a few hundred later --
  // so this can no longer blindly overwrite on every change of `normalizedHistory`.
  // It used to, and that was already a latent way to lose a conversation: anyone
  // who started typing before the file fetch returned had their messages replaced
  // the moment it did. The cache makes the panel look ready sooner, which makes
  // that window far easier to hit, so the rule is explicit now -- seed a file
  // once, top it up only while the panel is still empty, and never touch it while
  // the model is mid-turn.
  const seededRef = useRef<{ key: string; count: number } | null>(null);
  useEffect(() => {
    // The thread id is part of the key on purpose. During the migration off the
    // old `history` column both sources exist, and the legacy copy paints first
    // (it arrives with the file, the thread needs its own request). Keying on the
    // thread makes its arrival a new seed rather than a no-op, so the panel ends
    // up showing the authoritative copy instead of whichever landed first.
    const key = `${activeFileType}:${fileId}:${threadId ?? "legacy"}`;
    const next =
      activeFileType === "diagram" ? normalizedHistory.map(storedChatMessageToUIMessage) : [];
    const seeded = seededRef.current;

    // A turn in flight owns the transcript outright, whatever the key says. This
    // used to sit inside the key comparison below, so a key CHANGE bypassed it --
    // and the key changes at the worst moment, when `persistTurn` creates the
    // thread lazily on the first turn and `threadId` flips just as that turn
    // lands. `chat.status` is a dependency, so this defers the seed, never skips
    // it.
    //
    // In flight means `submitted`/`streaming`, NOT "not ready". `error` is a
    // resting state -- gating on it left a failed turn's transcript on screen
    // after the user resumed a different conversation, since nothing would ever
    // seed the one they picked. Same distinction the thread controls make.
    if (chat.status === "submitted" || chat.status === "streaming") return;

    if (seeded?.key === key) {
      // Already showing something, or nothing new to show.
      if (seeded.count > 0 || next.length === 0) return;
    }

    seededRef.current = { key, count: next.length };
    chat.setMessages(next);
  }, [activeFileType, fileId, threadId, normalizedHistory, chat.status, chat.setMessages]);

  useEffect(() => {
    if (chat.error instanceof CreationQuotaError) onQuotaError?.(chat.error.message);
    else if (chat.error instanceof UpstreamRateLimitError) onRateLimitError?.(chat.error.message);
    else if (
      chat.error instanceof AiProviderCreditError ||
      chat.error?.name === "AiProviderCreditError"
    ) {
      onProviderError?.(chat.error.message);
    }
    if (chat.error && seedStorageKeyRef.current) {
      window.localStorage.removeItem(seedStorageKeyRef.current);
      seedStorageKeyRef.current = null;
    }
  }, [chat.error, onProviderError, onQuotaError, onRateLimitError]);

  useEffect(() => {
    const hasAssistant = chat.messages.some((message) => message.role === "assistant");
    if (
      !allowSeedAutoRun ||
      !autoDiagramPrompt ||
      !excalidrawAPI ||
      hasAssistant ||
      hasExistingScene
    ) {
      return;
    }

    const key = `opendiagram:auto-diagram:v3:${projectId ?? "guest"}:${fileId ?? "file"}:${autoDiagramPrompt.id}`;
    if (seedAutoRunKeyRef.current === key) return;
    const storageKey = `opendiagram:auto-diagram-complete:v1:${projectId ?? "guest"}:${fileId ?? "file"}:${autoDiagramPrompt.id}`;
    if (window.localStorage.getItem(storageKey) === "complete") return;
    seedAutoRunKeyRef.current = key;
    seedStorageKeyRef.current = storageKey;
    window.localStorage.setItem(storageKey, "started");

    const seedMessage = chat.messages.find(
      (message) => message.role === "user" && uiMessageText(message) === autoDiagramPrompt.text,
    );
    void chat
      .sendMessage(
        seedMessage
          ? { text: autoDiagramPrompt.text, messageId: seedMessage.id }
          : { text: autoDiagramPrompt.text },
      )
      .then(() => {
        window.localStorage.setItem(storageKey, "complete");
      })
      .catch(() => {
        window.localStorage.removeItem(storageKey);
        seedStorageKeyRef.current = null;
      });
  }, [
    allowSeedAutoRun,
    autoDiagramPrompt,
    chat.messages,
    chat.sendMessage,
    excalidrawAPI,
    fileId,
    hasExistingScene,
    projectId,
  ]);

  return chat;
}
