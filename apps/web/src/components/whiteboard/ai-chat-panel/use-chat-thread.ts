import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import {
  appendThreadMessages,
  createThread,
  getActiveThread,
  listThreadMessages,
  listThreads,
  patchThreadTouched,
  type ChatThreadSummary,
} from "@/lib/projects-client";
import { uiMessageToStoredChatMessage, type StoredChatMessage } from "@/lib/chat-history";
import { writeLocalChat } from "@/lib/local-chat";

/** Messages per append request. Mirrors the cap the server enforces. */
const APPEND_BATCH_LIMIT = 20;

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
  // Written only from `adoptThread` and the lazy create in `persistTurn`, never
  // during render: React can replay or discard a render, so a mutation made there
  // can leak out of UI that never commits.
  const threadIdRef = useRef<string | null>(null);

  // Bumped by every action that changes which conversation is open. An in-flight
  // load compares the value it captured against this before adopting, so a slow
  // `getActiveThread` cannot land after a "New chat" and quietly restore the
  // conversation the user just left.
  const switchRef = useRef(0);

  // Appends run one at a time. Two overlapping turns would otherwise both find
  // `threadIdRef.current` null and create two threads for one canvas, and their
  // appends would race for the same sequence number on the server.
  const persistChainRef = useRef<Promise<void>>(Promise.resolve());

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

      const messages = thread.messages.map((message) => ({
        id: message.clientId,
        role: message.role,
        text: "",
        parts: message.parts as StoredChatMessage["parts"],
      }));
      onMessagesLoadedRef.current(messages);

      // The local cache is what paints this panel on the next open, and it holds
      // one entry per FILE with no thread identity in it. Rewriting it here is
      // what keeps the two agreeing: without it, reopening an older conversation
      // and then reloading showed the previously active one back again, because
      // the cache had never been told the conversation changed.
      if (fileId && projectId) void writeLocalChat(fileId, projectId, messages);
    },
    [fileId, projectId],
  );

  // Load the open conversation for this file. Runs behind the IndexedDB paint in
  // `useWorkspaceProjectLoader`, so this is revalidation rather than first paint.
  useEffect(() => {
    if (!projectId || !fileId) return;
    const generation = ++switchRef.current;
    setThreadLoaded(false);

    void getActiveThread(projectId, fileId)
      .then((thread) => {
        if (switchRef.current === generation) adoptThread(thread);
      })
      .catch(() => undefined);
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

      // One conversion for both consumers: the cache wants every message, the
      // append wants the ones with no watermark yet.
      const stored: StoredChatMessage[] = [];
      const unsaved: { clientId: string; role: "user" | "assistant"; parts: unknown[] }[] = [];
      for (const message of messages) {
        const entry = uiMessageToStoredChatMessage(message);
        if (!entry) continue;
        stored.push(entry);
        if (!savedIdsRef.current.has(message.id) && entry.parts?.length) {
          unsaved.push({ clientId: entry.id, role: entry.role, parts: entry.parts as unknown[] });
        }
      }

      // The local cache is written regardless -- it is what paints the panel next
      // time, and it should not depend on the network write succeeding.
      void writeLocalChat(fileId, projectId, stored);

      if (unsaved.length === 0) return;

      // Queued behind any append still running -- turns overlap when the model
      // answers from cache or the user answers an `ask_user` chip.
      const run = persistChainRef.current.then(async () => {
        try {
          let id = threadIdRef.current;
          if (!id) {
            const created = await createThread(projectId, fileId);
            id = created.id;
            threadIdRef.current = id;
            setThreadId(id);
          }

          // Chunked to the server's cap. `unsaved` is not one turn, it is
          // everything never acknowledged, so a spell offline leaves a backlog --
          // and sending it whole was rejected as too large, permanently, because
          // the backlog only ever grows.
          for (let start = 0; start < unsaved.length; start += APPEND_BATCH_LIMIT) {
            const batch = unsaved.slice(start, start + APPEND_BATCH_LIMIT);
            await appendThreadMessages(projectId, id, batch);
            // Marked per batch, so a failure partway through does not re-send the
            // batches the server already took.
            for (const message of batch) savedIdsRef.current.add(message.clientId);
          }
        } catch {
          // Left unsaved on purpose. The IndexedDB copy above still holds the
          // turn, and the next turn re-sends everything missing its watermark.
        }
      });

      persistChainRef.current = run;
      await run;
    },
    [fileId, projectId],
  );

  /** "New chat": a fresh transcript. The canvas and its diagrams are untouched. */
  const startNewThread = useCallback(async () => {
    if (!projectId || !fileId) return;
    setIsSwitching(true);
    // Anything still saving belongs to the conversation being left, so it is
    // flushed before the switch rather than landing in the new thread.
    await persistChainRef.current;
    const generation = ++switchRef.current;
    try {
      const created = await createThread(projectId, fileId);
      if (switchRef.current !== generation) return;
      adoptThread({ id: created.id, messages: [] });
      setThreads((current) => [created, ...current]);
      void writeLocalChat(fileId, projectId, []);
    } finally {
      setIsSwitching(false);
    }
  }, [adoptThread, fileId, projectId]);

  /** Reopen an earlier conversation, by id. */
  const resumeThread = useCallback(
    async (id: string) => {
      if (!projectId || !fileId) return;
      setIsSwitching(true);
      await persistChainRef.current;
      const generation = ++switchRef.current;
      try {
        // Touched so it becomes the thread this canvas reopens on, then read BY
        // ID. Re-reading whichever thread was newest is a different question: any
        // write bumping another thread in between handed the user a conversation
        // they did not ask for.
        await patchThreadTouched(projectId, id);
        const messages = await listThreadMessages(projectId, id);
        if (switchRef.current !== generation) return;
        adoptThread({ id, messages });
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
