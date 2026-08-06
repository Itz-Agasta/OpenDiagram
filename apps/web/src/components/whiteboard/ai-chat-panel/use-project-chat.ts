import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStatus, UIMessage } from "ai";
import type { Dispatch, SetStateAction } from "react";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import { uiMessagesToStoredChatHistory, type StoredChatMessage } from "@/lib/chat-history";
import { runProjectChatAgent } from "@/lib/workspace-agents";
import { CreationQuotaError, UpstreamRateLimitError } from "@/lib/projects-client";
import { queueProjectFilePatch } from "@/lib/project-file-sync";
import { appendStoredChatMessage } from "./chat-timeline";

interface UseProjectChatOptions {
  activeFileType?: "diagram" | "doc";
  /** The live diagram transcript, so an append can be computed outside a state updater. */
  diagramMessages: UIMessage[];
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
  diagramMessages,
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
  const requestControllerRef = useRef<AbortController | null>(null);

  // A mirror of the diagram transcript, so `run` can compute the next list and
  // hand the SAME value to setState, to the file write and to the thread. Those
  // last two used to happen inside the state updater, which React is free to
  // replay -- persistence must not run twice because a render was discarded.
  const diagramMessagesRef = useRef(diagramMessages);
  useEffect(() => {
    diagramMessagesRef.current = diagramMessages;
  }, [diagramMessages]);

  /** The same mirror for the doc transcript, which this hook owns outright. */
  const messagesRef = useRef(messages);

  // Writes here are replication behind the panel's own state; a rejection is
  // already reported through `saveError`, and a delete cancels queued patches on
  // purpose, so an unattached rejection would surface as an unhandled one.
  const queueHistory = useCallback(
    (history: StoredChatMessage[]) => {
      if (!projectId || !fileId) return;
      onHistoryChange?.(history);
      void queueProjectFilePatch(projectId, fileId, { history }, "meta").catch(() => undefined);
    },
    [fileId, onHistoryChange, projectId],
  );

  useEffect(() => {
    const seeded = activeFileType === "diagram" ? [] : normalizedHistory;
    messageIdRef.current = normalizedHistory.length;
    messagesRef.current = seeded;
    setMessages(seeded);
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
      const appendToDiagram = (message: StoredChatMessage) => {
        const next = appendStoredChatMessage(diagramMessagesRef.current, message);
        diagramMessagesRef.current = next;
        setDiagramMessages(next);
        return next;
      };

      if (activeFileType === "diagram") {
        appendToDiagram(userMessage);
      } else {
        messagesRef.current = [...messagesRef.current, userMessage];
        setMessages(messagesRef.current);
      }
      setStatus("submitted");
      setError(null);
      onProviderUsage(null);
      const requestController = new AbortController();
      requestControllerRef.current = requestController;

      try {
        const result = await runProjectChatAgent({
          text,
          projectId,
          providerId,
          modelId,
          signal: requestController.signal,
        });
        if (result.aiProvider) onProviderUsage(result.aiProvider);
        const assistantMessage: StoredChatMessage = {
          id: `msg-${messageIdRef.current++}`,
          role: "assistant",
          text: result.message,
        };
        if (activeFileType === "diagram") {
          // FIXME(github-import-chat): this turn is written to the legacy
          // `history` column and NOT to the thread, so it disappears the next
          // time the canvas is opened -- the panel renders `threadMessages` in
          // preference to `history` whenever a thread exists.
          //
          // Only reachable for a GitHub-imported diagram: every other canvas
          // short-circuits to the diagram agent in `handleSubmit` via
          // `shouldUseDiagramChatDirectly`, so this branch never runs for one.
          // Left unfixed by decision -- the whole import path is being rewritten,
          // and routing this through `persistTurn` now would be thrown away with
          // it. Fix it as part of that rewrite, not before.
          const updated = appendToDiagram(assistantMessage);
          queueHistory(uiMessagesToStoredChatHistory(updated));
        } else {
          // Doc files have no thread: nothing here ever creates one, so
          // `getActiveThread` answers 204 and the panel falls back to `history`.
          // Migrating project chat onto threads is tracked separately.
          const updated = [...messagesRef.current, assistantMessage];
          messagesRef.current = updated;
          setMessages(updated);
          queueHistory(updated);
        }
      } catch (caught) {
        if (requestController.signal.aborted) {
          // Nothing new to append: a stop only records what is already on screen.
          queueHistory(
            activeFileType === "diagram"
              ? uiMessagesToStoredChatHistory(diagramMessagesRef.current)
              : messagesRef.current,
          );
          return true;
        }
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
          queueHistory(uiMessagesToStoredChatHistory(appendToDiagram(errorMessage)));
        } else {
          messagesRef.current = [...messagesRef.current, errorMessage];
          setMessages(messagesRef.current);
        }
        setError(message);
      } finally {
        if (requestControllerRef.current === requestController) {
          requestControllerRef.current = null;
        }
        if (
          requestControllerRef.current === null ||
          requestControllerRef.current === requestController
        ) {
          setStatus("ready");
        }
      }

      return true;
    },
    [
      activeFileType,
      onProviderUsage,
      onProviderError,
      onRateLimitError,
      onQuotaError,
      projectId,
      providerId,
      modelId,
      queueHistory,
      setDiagramMessages,
    ],
  );

  const stop = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setStatus("ready");
  }, []);

  return { error, messages, run, status, stop };
}
