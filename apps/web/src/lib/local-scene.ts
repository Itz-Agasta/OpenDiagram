import { createStore, del, get, set, update } from "idb-keyval";
import type { ProjectFileType } from "@/lib/projects-client";

/**
 * Browser-side source of truth for the document currently open on the canvas.
 *
 * The canvas used to block on three sequential network waves before it could
 * paint -- session, then project + file list, then the file itself -- so the
 * first pixel cost seconds. Here IndexedDB answers first and the network only
 * ever revalidates, which is the same shape Excalidraw uses in
 * `excalidraw-app/data/LocalData.ts`.
 */
const sceneStore = createStore("opendiagram-scene-db", "scene-store");

export type LocalScene = {
  fileId: string;
  projectId: string;
  type: ProjectFileType;
  scene: unknown;
  content: string;
  /** ISO timestamp of the last local edit. Compared against the server's. */
  updatedAt: string;
  /** True while local holds edits the server has not acknowledged. */
  dirty: boolean;
  /**
   * Server revision this copy is known to equal, so an open at that revision
   * needs no download. Set only from an acknowledged save or a download; any
   * other write leaves it unset and the next open fetches.
   */
  sceneRev?: number | null;
};

export async function readLocalScene(fileId: string): Promise<LocalScene | null> {
  try {
    return (await get<LocalScene>(fileId, sceneStore)) ?? null;
  } catch {
    // A blocked or unavailable IndexedDB (private mode, storage pressure) must
    // degrade to network-only rather than break the canvas.
    return null;
  }
}

export async function writeLocalScene(entry: LocalScene): Promise<void> {
  try {
    await set(entry.fileId, entry, sceneStore);
  } catch {
    // Losing the local copy is survivable -- the sync queue still holds the
    // pending write in memory, so the edit reaches the server regardless.
  }
}

export async function deleteLocalScene(fileId: string): Promise<void> {
  try {
    await del(fileId, sceneStore);
  } catch {
    /* nothing useful to do */
  }
}

/**
 * Record a save the server acknowledged, but only if the entry still holds
 * what that save sent. The check and the write share one IndexedDB
 * transaction, so an edit written in between is never marked clean, whether or
 * not its file is still open. A missing entry gets the saved copy.
 */
export async function markLocalSceneSaved(
  saved: LocalScene,
  holdsSent: (entry: LocalScene) => boolean,
): Promise<void> {
  try {
    await update<LocalScene | undefined>(
      saved.fileId,
      (entry) => (!entry || holdsSent(entry) ? saved : entry),
      sceneStore,
    );
  } catch {
    // Same as writeLocalScene: an unavailable IndexedDB degrades to network-only.
  }
}
