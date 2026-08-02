import { createStore, del, get, set } from "idb-keyval";
import type { StoredChatMessage } from "@/lib/chat-history";

/**
 * Browser-side cache of the chat transcript for the file currently open.
 *
 * The canvas has painted from IndexedDB since the local-first work, but the chat
 * panel did not: `local-scene.ts` cached `scene` and `content` and nothing else,
 * so the transcript arrived only with `activeFile.history` at the end of three
 * sequential network waves (session, then project + file list, then the file
 * itself). That is why the canvas appeared instantly on a reload while the
 * conversation beside it stayed blank for seconds -- not a slow endpoint, a
 * missing cache.
 *
 * A separate store from the scene deliberately, for the same reason Excalidraw
 * keeps blobs out of its scene store: the two change on unrelated schedules. The
 * scene is rewritten on every stroke, the transcript only when a turn completes,
 * and pairing them would mean re-serialising a multi-hundred-kilobyte scene to
 * record one chat message.
 *
 * Bounded on purpose. Only the messages the panel would render on open are kept
 * -- older ones live in Postgres and are fetched when asked for. The cache tracks
 * what is on screen, not the whole history of the file, so it does not grow with
 * how long the app has been used.
 */
const chatStore = createStore("opendiagram-chat-db", "chat-store");

/**
 * Messages kept per file. Comfortably more than a panel shows before the user
 * scrolls, and small enough that the whole entry is a cheap single write.
 */
export const LOCAL_CHAT_MESSAGE_LIMIT = 50;

export type LocalChat = {
  fileId: string;
  projectId: string;
  messages: StoredChatMessage[];
  /** ISO timestamp of the last local write. Diagnostic only -- never used to win a conflict. */
  updatedAt: string;
};

export async function readLocalChat(fileId: string): Promise<LocalChat | null> {
  try {
    return (await get<LocalChat>(fileId, chatStore)) ?? null;
  } catch {
    // A blocked or unavailable IndexedDB (private mode, storage pressure) must
    // degrade to network-only rather than break the chat panel.
    return null;
  }
}

export async function writeLocalChat(
  fileId: string,
  projectId: string,
  messages: StoredChatMessage[],
): Promise<void> {
  try {
    await set(
      fileId,
      {
        fileId,
        projectId,
        // Trailing slice: the newest messages are the ones the panel opens on.
        messages: messages.slice(-LOCAL_CHAT_MESSAGE_LIMIT),
        updatedAt: new Date().toISOString(),
      } satisfies LocalChat,
      chatStore,
    );
  } catch {
    // Losing the cache costs a slower first paint next time, nothing more --
    // the server copy is still the durable one for chat.
  }
}

export async function deleteLocalChat(fileId: string): Promise<void> {
  try {
    await del(fileId, chatStore);
  } catch {
    /* nothing useful to do */
  }
}
