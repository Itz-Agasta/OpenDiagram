import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStatus, UIMessage } from "ai";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import { uiMessagesToStoredChatHistory, type StoredChatMessage } from "@/lib/chat-history";
import { runProjectChatAgent } from "@/lib/workspace-agents";
import { CreationQuotaError, updateProjectFile } from "@/lib/projects-client";

interface UseProjectChatOptions {
  activeFileType?: "diagram" | "doc";
  diagramMessages: UIMessage[];
  fileId?: string;
  normalizedHistory: StoredChatMessage[];
  onHistoryChange?: (history: StoredChatMessage[]) => void;
  onProviderUsage: (usage: AiProviderUsage | null) => void;
  onProviderError?: (message: string) => void;
  onQuotaError?: (message: string) => void;
  projectId?: string;
  providerId?: string;
  modelId?: string;
}

export function useProjectChat({
  activeFileType,
  diagramMessages,
  fileId,
  normalizedHistory,
  onHistoryChange,
  onProviderUsage,
  onProviderError,
  onQuotaError,
  projectId,
  providerId,
  modelId,
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

      setMessages((previous) => [
        ...previous,
        { id: `msg-${messageIdRef.current++}`, role: "user", text },
      ]);
      setStatus("submitted");
      setError(null);
      onProviderUsage(null);

      try {
        const result = await runProjectChatAgent({ text, projectId, providerId, modelId });
        if (result.aiProvider) onProviderUsage(result.aiProvider);
        setMessages((previous) => {
          const updated = [
            ...previous,
            {
              id: `msg-${messageIdRef.current++}`,
              role: "assistant" as const,
              text: result.message,
            },
          ];

          if (fileId) {
            window.setTimeout(() => {
              const history =
                activeFileType === "diagram"
                  ? [...uiMessagesToStoredChatHistory(diagramMessages), ...updated]
                  : updated;
              onHistoryChange?.(history);
              void updateProjectFile(projectId, fileId, { history });
            }, 0);
          }

          return updated;
        });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Project chat failed";
        if (caught instanceof CreationQuotaError) onQuotaError?.(message);
        else if (caught instanceof Error && caught.name === "AiProviderCreditError") {
          onProviderError?.(message);
        }
        setMessages((previous) => [
          ...previous,
          { id: `msg-${messageIdRef.current++}`, role: "assistant", text: `Error: ${message}` },
        ]);
        setError(message);
      } finally {
        setStatus("ready");
      }

      return true;
    },
    [
      activeFileType,
      diagramMessages,
      fileId,
      onHistoryChange,
      onProviderUsage,
      onProviderError,
      onQuotaError,
      projectId,
      providerId,
      modelId,
    ],
  );

  return { error, messages, run, status };
}
