import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStatus, UIMessage } from "ai";
import type { Dispatch, SetStateAction } from "react";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import { uiMessagesToStoredChatHistory, type StoredChatMessage } from "@/lib/chat-history";
import { runProjectChatAgent } from "@/lib/workspace-agents";
import {
  CreationQuotaError,
  updateProjectFile,
  UpstreamRateLimitError,
} from "@/lib/projects-client";
import { appendStoredChatMessage } from "./chat-timeline";

interface UseProjectChatOptions {
  activeFileType?: "diagram" | "doc";
  fileId?: string;
  normalizedHistory: StoredChatMessage[];
  onHistoryChange?: (history: StoredChatMessage[]) => void;
  onProviderUsage: (usage: AiProviderUsage | null) => void;
  onProviderError?: (message: string) => void;
  onRateLimitError?: (message: string) => void;
  onQuotaError?: (message: string) => void;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  setDiagramMessages: Dispatch<SetStateAction<UIMessage[]>>;
}

export function useProjectChat({
  activeFileType,
  fileId,
  normalizedHistory,
  onHistoryChange,
  onProviderUsage,
  onProviderError,
  onRateLimitError,
  onQuotaError,
  projectId,
  providerId,
  modelId,
  setDiagramMessages,
}: UseProjectChatOptions) {
  const messageIdRef = useRef(normalizedHistory.length);
  const [messages, setMessages] = useState<StoredChatMessage[]>(
    activeFileType === "diagram" ? [] : normalizedHistory,
  );
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    messageIdRef.current = normalizedHistory.length;
    setMessages(activeFileType === "diagram" ? [] : normalizedHistory);
    setError(null);
    setStatus("ready");
  }, [activeFileType, fileId, normalizedHistory]);

  const run = useCallback(
    async (text: string) => {
      if (!projectId) return false;

      const userMessage: StoredChatMessage = {
        id: `msg-${messageIdRef.current++}`,
        role: "user",
        text,
      };
      if (activeFileType === "diagram") {
        setDiagramMessages((previous) => appendStoredChatMessage(previous, userMessage));
      } else {
        setMessages((previous) => [...previous, userMessage]);
      }
      setStatus("submitted");
      setError(null);
      onProviderUsage(null);

      try {
        const result = await runProjectChatAgent({ text, projectId, providerId, modelId });
        if (result.aiProvider) onProviderUsage(result.aiProvider);
        const assistantMessage: StoredChatMessage = {
          id: `msg-${messageIdRef.current++}`,
          role: "assistant",
          text: result.message,
        };
        if (activeFileType === "diagram") {
          setDiagramMessages((previous) => {
            const updated = appendStoredChatMessage(previous, assistantMessage);
            if (fileId) {
              window.setTimeout(() => {
                const history = uiMessagesToStoredChatHistory(updated);
                onHistoryChange?.(history);
                void updateProjectFile(projectId, fileId, { history });
              }, 0);
            }
            return updated;
          });
        } else {
          setMessages((previous) => {
            const updated = [...previous, assistantMessage];
            if (fileId) {
              window.setTimeout(() => {
                onHistoryChange?.(updated);
                void updateProjectFile(projectId, fileId, { history: updated });
              }, 0);
            }
            return updated;
          });
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Project chat failed";
        if (caught instanceof CreationQuotaError) onQuotaError?.(message);
        else if (caught instanceof UpstreamRateLimitError) onRateLimitError?.(message);
        else if (caught instanceof Error && caught.name === "AiProviderCreditError") {
          onProviderError?.(message);
        }
        const errorMessage: StoredChatMessage = {
          id: `msg-${messageIdRef.current++}`,
          role: "assistant",
          text: `Error: ${message}`,
        };
        if (activeFileType === "diagram") {
          setDiagramMessages((previous) => appendStoredChatMessage(previous, errorMessage));
        } else {
          setMessages((previous) => [...previous, errorMessage]);
        }
        setError(message);
      } finally {
        setStatus("ready");
      }

      return true;
    },
    [
      activeFileType,
      fileId,
      onHistoryChange,
      onProviderUsage,
      onProviderError,
      onRateLimitError,
      onQuotaError,
      projectId,
      providerId,
      modelId,
      setDiagramMessages,
    ],
  );

  return { error, messages, run, status };
}
