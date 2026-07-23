import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { RefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSpec, ThemeName } from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/web";
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
  updateProjectFile,
  UpstreamRateLimitError,
} from "@/lib/projects-client";
import { fetchDiagramChat } from "./utils";

interface UseDiagramChatOptions {
  activeFileType?: "diagram" | "doc";
  allowSeedAutoRun: boolean;
  autoDiagramPrompt?: StoredChatMessage;
  currentSpecRef: RefObject<DiagramSpec | undefined>;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  fileId?: string;
  hasExistingScene?: boolean;
  normalizedHistory: StoredChatMessage[];
  onHistoryChange?: (history: StoredChatMessage[]) => void;
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
    currentSpecRef,
    excalidrawAPI,
    fileId,
    hasExistingScene,
    normalizedHistory,
    onHistoryChange,
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
        body: () => ({
          currentSpec: currentSpecRef.current,
          modelId,
          providerId,
          theme: themeRef.current,
        }),
        fetch: chatFetch,
      }),
    [chatFetch, currentSpecRef, modelId, providerId],
  );
  const initialMessages =
    activeFileType === "diagram" ? normalizedHistory.map(storedChatMessageToUIMessage) : [];
  const chat = useChat({
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ messages }) => {
      const history = uiMessagesToStoredChatHistory(messages);
      onHistoryChange?.(history);
      if (projectId && fileId) void updateProjectFile(projectId, fileId, { history });
    },
  });

  useEffect(() => {
    chat.setMessages(
      activeFileType === "diagram" ? normalizedHistory.map(storedChatMessageToUIMessage) : [],
    );
  }, [activeFileType, fileId, normalizedHistory, chat.setMessages]);

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
    if (window.localStorage.getItem(storageKey)) return;
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
