"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { useKumoToastManager } from "@cloudflare/kumo";
import { projectFileQueryOptions } from "#/lib/api";
import { useChatThread } from "#/hooks/useChatThread";
import { useDiagramChatSession } from "#/hooks/useDiagramChatSession";
import { DiagramChatContext, type DiagramChatAttachment } from "#/hooks/useDiagramChatContext";
import {
  CreationQuotaError,
  AiProviderCreditError,
  UpstreamRateLimitError,
  type ChatMessage,
} from "#/lib/types";
import type { CanvasDiagram } from "#/lib/utils/canvas-diagrams";
import { pendingAskUser } from "#/lib/utils/diagram-chat";
import {
  normalizeStoredChatHistory,
  storedChatMessageToUIMessage,
  type StoredChatMessage,
} from "#/lib/utils/chat-history";
import { getPendingFiles, clearPendingFiles, type OfflinePendingFile } from "#/lib/utils";

export type DiagramChatProviderProps = {
  projectId: string;
  fileId: string;
  diagramsRef: RefObject<CanvasDiagram[]>;
  modelId: string | null;
  providerId: string | null;
  init?: boolean;
  onClearInit?: () => void;
  onInitHandoff?: () => void;
  children: ReactNode;
};

function lastUserText(messages: ChatMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "user") continue;
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }
  return undefined;
}

export function DiagramChatProvider({
  projectId,
  fileId,
  diagramsRef,
  modelId,
  providerId,
  init,
  onClearInit,
  onInitHandoff,
  children,
}: DiagramChatProviderProps) {
  const toastManager = useKumoToastManager();
  const [input, setInput] = useState("");
  const [isHistorySeeded, setIsHistorySeeded] = useState(false);
  const [threadMessages, setThreadMessages] = useState<StoredChatMessage[] | null>(null);
  const skippedMessageIdsRef = useRef(new Set<string>());
  const initTriggeredRef = useRef(false);

  const { data: activeFile, isLoading: isActiveFileLoading } = useQuery(
    projectFileQueryOptions(projectId, fileId),
  );

  const { persistTurn, threadLoaded } = useChatThread({
    projectId,
    fileId,
    onMessagesLoaded: setThreadMessages,
  });

  const handleChatError = useCallback(
    (error: Error) => {
      if (error instanceof CreationQuotaError) {
        toastManager.add({
          title: "Quota Exceeded",
          description: error.message,
          variant: "warning",
        });
      } else if (error instanceof UpstreamRateLimitError) {
        toastManager.add({
          title: "Rate Limited",
          description: error.message,
          variant: "warning",
        });
      } else if (error instanceof AiProviderCreditError || error.name === "AiProviderCreditError") {
        toastManager.add({
          title: "Billing/Credit Issue",
          description: error.message,
          variant: "error",
        });
      }
    },
    [toastManager],
  );

  const { messages, setMessages, sendMessage, status, error, addToolOutput, stop, clearError } =
    useDiagramChatSession({
      fileId,
      diagramsRef,
      modelId,
      providerId,
      persistTurn,
      onError: handleChatError,
    });

  useEffect(() => {
    skippedMessageIdsRef.current.clear();
    setIsHistorySeeded(false);
    setThreadMessages(null);
    initTriggeredRef.current = false;
  }, [fileId]);

  useEffect(() => {
    if (!threadLoaded || isActiveFileLoading || isHistorySeeded) return;

    const stored =
      threadMessages !== null ? threadMessages : normalizeStoredChatHistory(activeFile?.history);

    const next = stored.map(storedChatMessageToUIMessage) as ChatMessage[];
    setMessages(next);
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
    setMessages,
    persistTurn,
  ]);

  useEffect(() => {
    if (!init || initTriggeredRef.current || !isHistorySeeded) return;

    const pendingPrompt = localStorage.getItem("pending_agent_prompt");

    async function checkHandoff(): Promise<void> {
      let files: OfflinePendingFile[] | undefined;
      let hasFiles = false;

      try {
        const idbFiles = await getPendingFiles();
        if (idbFiles && idbFiles.length > 0) {
          files = idbFiles;
          hasFiles = true;
        }
      } catch (err) {
        console.error("Failed to read IndexedDB pending files", err);
      }

      const pendingFilesRaw = localStorage.getItem("pending_agent_files");
      if (!hasFiles && pendingFilesRaw) {
        try {
          files = JSON.parse(pendingFilesRaw) as OfflinePendingFile[];
          hasFiles = true;
        } catch (err) {
          console.error("Failed to parse pending files from localStorage", err);
        }
      }

      if (pendingPrompt === null && !hasFiles) return;

      initTriggeredRef.current = true;
      localStorage.removeItem("pending_agent_prompt");
      localStorage.removeItem("pending_agent_files");
      void clearPendingFiles().catch(console.error);

      onInitHandoff?.();
      onClearInit?.();
      void sendMessage({ text: pendingPrompt || "", files });
    }

    void checkHandoff();
  }, [init, isHistorySeeded, sendMessage, onClearInit, onInitHandoff]);

  const answerAskUser = useCallback(
    (toolCallId: string, output: string) => {
      addToolOutput({ tool: "ask_user", toolCallId, output });
    },
    [addToolOutput],
  );

  const pendingAsk = pendingAskUser(messages);

  const submitText = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    if (pendingAsk) {
      answerAskUser(pendingAsk.toolCallId, text);
    } else {
      void sendMessage({ text });
    }
    setInput("");
  }, [answerAskUser, pendingAsk, sendMessage, input]);

  const submitWithFiles = useCallback(
    (files?: DiagramChatAttachment[]) => {
      const text = input.trim();
      if (!text && (!files || files.length === 0)) return;

      if (pendingAsk) {
        answerAskUser(pendingAsk.toolCallId, text);
      } else {
        void sendMessage({ text, files });
      }
      setInput("");
    },
    [answerAskUser, pendingAsk, sendMessage, input],
  );

  return (
    <DiagramChatContext.Provider
      value={{
        messages,
        setMessages,
        sendMessage,
        status,
        error,
        addToolOutput,
        stop,
        clearError,
        persistTurn,
        threadLoaded,
        isHistorySeeded,
        skippedMessageIdsRef,
        pendingAsk,
        answerAskUser,
        input,
        setInput,
        submitText,
        submitWithFiles,
        lastUserMessage: lastUserText(messages),
        isLoading: status === "streaming" || status === "submitted",
      }}
    >
      {children}
    </DiagramChatContext.Provider>
  );
}
