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
import { CreationQuotaError, updateProjectFile } from "@/lib/projects-client";
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
    onQuotaError,
    projectId,
    providerId,
    modelId,
    theme,
  } = options;
  const seedAutoRunKeyRef = useRef<string | null>(null);
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
    else if (chat.error?.message.includes("BYOK provider has reached")) {
      onProviderError?.(chat.error.message);
    }
  }, [chat.error, onProviderError, onQuotaError]);

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
    seedAutoRunKeyRef.current = key;

    const seedMessage = chat.messages.find(
      (message) => message.role === "user" && uiMessageText(message) === autoDiagramPrompt.text,
    );
    void chat
      .sendMessage(
        seedMessage
          ? { text: autoDiagramPrompt.text, messageId: seedMessage.id }
          : { text: autoDiagramPrompt.text },
      )
      .catch(() => undefined);
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
