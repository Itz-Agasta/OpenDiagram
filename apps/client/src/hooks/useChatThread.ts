import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { appendThreadMessages, createThread, getActiveThread } from "#/lib/api/threads";
import { uiMessageToStoredChatMessage, type StoredChatMessage } from "#/lib/utils/chat-history";

const APPEND_BATCH_LIMIT = 20;

export function useChatThread(options: {
  projectId: string;
  fileId: string;
  onMessagesLoaded: (messages: StoredChatMessage[] | null) => void;
}) {
  const { projectId, fileId, onMessagesLoaded } = options;
  const [threadLoaded, setThreadLoaded] = useState(false);

  const savedIdsRef = useRef(new Set<string>());
  const threadIdRef = useRef<string | null>(null);
  const persistChainRef = useRef<Promise<void>>(Promise.resolve());
  const switchRef = useRef(0);

  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  }, [onMessagesLoaded]);

  const adoptThread = useCallback(
    (
      thread: {
        id: string;
        messages: { clientId: string; role: "user" | "assistant"; parts: unknown[] }[];
      } | null,
    ) => {
      savedIdsRef.current = new Set(thread?.messages.map((message) => message.clientId) ?? []);
      threadIdRef.current = thread?.id ?? null;
      setThreadLoaded(true);

      if (!thread) {
        onMessagesLoadedRef.current(null);
        return;
      }

      onMessagesLoadedRef.current(
        thread.messages.map((message) => ({
          id: message.clientId,
          role: message.role,
          text: "",
          parts: message.parts as StoredChatMessage["parts"],
        })),
      );
    },
    [],
  );

  useEffect(() => {
    const generation = ++switchRef.current;
    setThreadLoaded(false);
    threadIdRef.current = null;
    savedIdsRef.current = new Set();

    void getActiveThread(projectId, fileId)
      .then((thread) => {
        if (switchRef.current === generation) adoptThread(thread);
      })
      .catch(() => {
        if (switchRef.current === generation) adoptThread(null);
      });
  }, [adoptThread, fileId, projectId]);

  const persistTurn = useCallback(
    async (messages: UIMessage[]) => {
      if (!projectId || !fileId) return;

      const unsaved: { clientId: string; role: "user" | "assistant"; parts: unknown[] }[] = [];
      for (const message of messages) {
        const entry = uiMessageToStoredChatMessage(message);
        if (!entry) continue;
        if (!savedIdsRef.current.has(message.id) && entry.parts?.length) {
          unsaved.push({
            clientId: entry.id,
            role: entry.role,
            parts: entry.parts as unknown[],
          });
        }
      }

      if (unsaved.length === 0) return;

      const run = persistChainRef.current.then(async () => {
        try {
          let id = threadIdRef.current;
          if (!id) {
            const created = await createThread(projectId, fileId);
            id = created.id;
            threadIdRef.current = id;
          }

          for (let start = 0; start < unsaved.length; start += APPEND_BATCH_LIMIT) {
            const batch = unsaved.slice(start, start + APPEND_BATCH_LIMIT);
            await appendThreadMessages(projectId, id, batch);
            for (const message of batch) savedIdsRef.current.add(message.clientId);
          }
        } catch {
          // Left unsaved. Next persistTurn retries anything missing a watermark.
        }
      });

      persistChainRef.current = run;
      await run;
    },
    [fileId, projectId],
  );

  return { persistTurn, threadLoaded };
}
