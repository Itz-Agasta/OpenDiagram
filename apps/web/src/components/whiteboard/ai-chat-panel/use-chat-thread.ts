import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import {
  appendThreadMessages,
  createThread,
  getActiveThread,
  listThreads,
  patchThreadTouched,
  type ChatThreadSummary,
} from "@/lib/projects-client";
import { uiMessageToStoredChatMessage, type StoredChatMessage } from "@/lib/chat-history";
import { writeLocalChat } from "@/lib/local-chat";

/**
 * Owns which conversation is open for a file, and what of it is already saved.
 *
 * The old shape rewrote the file's whole `history` array on every turn, so
 * "what changed" never had to be answered. Appending does have to answer it, and
 * the watermark here is a set of message ids rather than a count: the AI SDK
 * inserts tool results and rewrites assistant messages in place mid-turn, so
 * "everything past index N" would re-send messages that only moved.
 */
export function useChatThread(options: {
  projectId?: string;
  fileId?: string;
  /** Seeded into the panel when a thread loads, replacing the old `initialHistory`. */
  onMessagesLoaded: (messages: StoredChatMessage[]) => void;
}) {
  const { projectId, fileId, onMessagesLoaded } = options;
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [threadLoaded, setThreadLoaded] = useState(false);

  // Ids already in Postgres. Seeded from whatever a thread load returned so a
  // reopened conversation does not re-append everything it just read back.
  const savedIdsRef = useRef(new Set<string>());
  const threadIdRef = useRef<string | null>(null);
  threadIdRef.current = threadId;

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
      setThreadId(thread?.id ?? null);
      setThreadLoaded(true);

      // A null thread means the server has no conversation for this canvas at
      // all, which is not the same as "the conversation is empty". Reporting it
      // as an empty transcript would blank whatever IndexedDB had already
      // painted -- including a turn whose network write failed, which
      // `persistTurn` deliberately leaves in the cache to be retried. Saying
      // nothing leaves the cached copy on screen, which is the honest answer.
      //
      // "New chat" is unaffected: it adopts a real thread object with an empty
      // message list, so the panel still clears.
      if (!thread) return;

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

  // Load the open conversation for this file. Runs behind the IndexedDB paint in
  // `useWorkspaceProjectLoader`, so this is revalidation rather than first paint.
  useEffect(() => {
    if (!projectId || !fileId) return;
    let active = true;
    setThreadLoaded(false);

    void getActiveThread(projectId, fileId)
      .then((thread) => {
        if (active) adoptThread(thread);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [adoptThread, fileId, projectId]);

  /**
   * Persist a completed turn: the messages it added, and nothing else.
   *
   * The diagrams used to ride along here as a single `spec` plus `frameId` on the
   * thread. They live on the file now -- a canvas holds several diagrams and they
   * outlive any one conversation, so a thread was the wrong owner.
   *
   * Creates the thread lazily on the first turn, so a canvas nobody has talked to
   * carries no rows at all.
   */
  const persistTurn = useCallback(
    async (messages: UIMessage[]) => {
      if (!projectId || !fileId) return;

      const unsaved = messages
        .filter((message) => !savedIdsRef.current.has(message.id))
        .flatMap((message) => {
          const stored = uiMessageToStoredChatMessage(message);
          return stored?.parts?.length
            ? [{ clientId: stored.id, role: stored.role, parts: stored.parts as unknown[] }]
            : [];
        });

      // The local cache is written regardless -- it is what paints the panel next
      // time, and it should not depend on the network write succeeding.
      void writeLocalChat(
        fileId,
        projectId,
        messages.flatMap((message) => {
          const stored = uiMessageToStoredChatMessage(message);
          return stored ? [stored] : [];
        }),
      );

      if (unsaved.length === 0) return;

      try {
        let id = threadIdRef.current;
        if (!id) {
          const created = await createThread(projectId, fileId);
          id = created.id;
          threadIdRef.current = id;
          setThreadId(id);
        }
        await appendThreadMessages(projectId, id, unsaved);
        // Only after the server took them, so a failed write is retried by the
        // next turn rather than silently dropped.
        for (const message of unsaved) savedIdsRef.current.add(message.clientId);
      } catch {
        // Left unsaved on purpose. The IndexedDB copy above still holds the turn,
        // and the next turn re-sends everything still missing its watermark.
      }
    },
    [fileId, projectId],
  );

  /** "New chat": a fresh transcript. The canvas and its diagrams are untouched. */
  const startNewThread = useCallback(async () => {
    if (!projectId || !fileId) return;
    setIsSwitching(true);
    try {
      const created = await createThread(projectId, fileId);
      adoptThread({ id: created.id, messages: [] });
      setThreads((current) => [created, ...current]);
      void writeLocalChat(fileId, projectId, []);
    } finally {
      setIsSwitching(false);
    }
  }, [adoptThread, fileId, projectId]);

  /** Reopen an earlier conversation: its messages and the diagram it was editing. */
  const resumeThread = useCallback(
    async (id: string) => {
      if (!projectId || !fileId) return;
      setIsSwitching(true);
      try {
        // Touch first, then re-read: bumping `updated_at` makes this the active
        // thread, which `getActiveThread` then returns with its messages.
        await patchThreadTouched(projectId, id);
        adoptThread(await getActiveThread(projectId, fileId));
      } finally {
        setIsSwitching(false);
      }
    },
    [adoptThread, fileId, projectId],
  );

  /** Lazy: the history list is only fetched when the user opens it. */
  const loadThreadList = useCallback(async () => {
    if (!projectId || !fileId) return;
    setThreads(await listThreads(projectId, fileId));
  }, [fileId, projectId]);

  return {
    isSwitching,
    resumeThread,
    threadLoaded,
    loadThreadList,
    persistTurn,
    startNewThread,
    threadId,
    threads,
  };
}
