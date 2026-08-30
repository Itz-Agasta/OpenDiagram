import { deleteLocalChat } from "@/lib/local-chat";
import { deleteLocalScene } from "@/lib/local-scene";
import { cancelQueuedProjectFilePatch } from "@/lib/project-file-sync";
import { resetSceneDelta } from "@/lib/scene-delta";

/**
 * Drop every browser-side trace of files the server has just deleted.
 *
 * The four stores outlive the row on their own: IndexedDB scenes and chats are
 * keyed by file id and nothing expires them, the delta baseline sits in memory,
 * and a queued PATCH would fire at a 404 afterwards. Deleting the row without
 * this leaves a scene blob (KBs to MBs each) on the device forever, and the ids
 * are random so nothing ever collides with it to clean it up.
 *
 * Call it after the DELETE succeeds, not before: a failed request must leave the
 * local copy intact, since it is the only remaining one.
 */
export function forgetLocalFiles(fileIds: string[]) {
  for (const fileId of fileIds) {
    cancelQueuedProjectFilePatch(fileId);
    resetSceneDelta(fileId);
    void deleteLocalScene(fileId);
    void deleteLocalChat(fileId);
  }
}
