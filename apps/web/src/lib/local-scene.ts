import { createStore, del, get, set } from "idb-keyval";
import type { ProjectFileType } from "@/lib/projects-client";

/**
 * Browser-side source of truth for the document currently open on the canvas.
 *
 * The canvas used to block on three sequential network waves before it could
 * paint -- session, then project + file list, then the file itself -- so the
 * first pixel cost seconds. Here IndexedDB answers first and the network only
 * ever revalidates, which is the same shape Excalidraw uses in
 * `excalidraw-app/data/LocalData.ts`.
 *
 * Two stores, not one, and for the reason Excalidraw splits them: scene JSON is
 * small and rewritten on every edit, while image blobs are large and immutable
 * once written. Keying blobs separately by their own id keeps a 800 kB image
 * from being re-serialised every time an arrow moves, and matches how they will
 * be keyed in object storage when they move off the row entirely.
 */
const sceneStore = createStore("opendiagram-scene-db", "scene-store");
const blobStore = createStore("opendiagram-blob-db", "blob-store");

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

/** Excalidraw `BinaryFileData` keyed by its own file id. */
export async function readLocalBlob<T>(id: string): Promise<T | null> {
  try {
    return (await get<T>(id, blobStore)) ?? null;
  } catch {
    return null;
  }
}

export async function writeLocalBlob<T>(id: string, value: T): Promise<void> {
  try {
    await set(id, value, blobStore);
  } catch {
    /* nothing useful to do */
  }
}
