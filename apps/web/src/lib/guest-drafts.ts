import { createStore, del, entries, set } from "idb-keyval";
import type { ProjectFileType } from "@/lib/projects-client";
import type { StoredChatMessage } from "@/lib/chat-history";

export type GuestDraftFile = {
  id: string;
  name: string;
  type?: ProjectFileType;
  scene?: unknown;
  spec?: unknown;
  content?: unknown;
  history?: StoredChatMessage[];
};

export type GuestProjectDraft = {
  id: string;
  name: string;
  description?: string;
  files: GuestDraftFile[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Guest work, kept on the device until the visitor signs up.
 *
 * This used to be an in-memory `Map` and nothing else, which survived
 * client-side navigation and lost everything on refresh, tab close, or a new
 * session. That is the wrong failure for the one artefact a guest has: they draw
 * a diagram, reload, and it is gone. The Map is still here, but only as a
 * synchronous read cache in front of IndexedDB -- the same store the canvas uses
 * for signed-in scenes, so promoting a draft at signup is a flag flip rather than
 * a data migration.
 */
const draftStore = createStore("opendiagram-draft-db", "draft-store");

const guestDrafts = new Map<string, GuestProjectDraft>();
const legacyDraftPrefix = "opendiagram:guest-project:";

function clearLegacyDrafts() {
  if (typeof window === "undefined") return;
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(legacyDraftPrefix)) window.localStorage.removeItem(key);
  }
}

/**
 * Read IndexedDB into the cache once per page load.
 *
 * Memoised on the promise rather than a boolean so concurrent readers -- the
 * dashboard list and the workspace loader can mount together -- share one read
 * instead of racing two.
 */
let hydration: Promise<void> | null = null;

function hydrate(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      clearLegacyDrafts();
      try {
        for (const [id, draft] of await entries<string, GuestProjectDraft>(draftStore)) {
          // Anything already in the cache was written during this page load, so
          // it is newer than what is on disk by construction. Skipping those
          // keeps a save that lands mid-hydration from being undone by it.
          if (!guestDrafts.has(id)) guestDrafts.set(id, draft);
        }
      } catch {
        // A blocked or unavailable IndexedDB (private mode, storage pressure)
        // degrades to the in-memory behaviour this replaced, rather than
        // breaking the dashboard.
      }
    })();
  }
  return hydration;
}

export function createGuestProjectDraft(
  name: string,
  fileName?: string,
  fileType: ProjectFileType = "diagram",
  content?: unknown,
  history?: StoredChatMessage[],
): GuestProjectDraft {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name,
    files: [
      {
        id: crypto.randomUUID(),
        name: fileName?.trim() || "Your first design",
        type: fileType,
        content: fileType === "doc" ? content : undefined,
        history,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export async function getGuestProjectDraft(id: string): Promise<GuestProjectDraft | null> {
  await hydrate();
  return guestDrafts.get(id) ?? null;
}

export async function listGuestProjectDrafts(): Promise<GuestProjectDraft[]> {
  await hydrate();
  return [...guestDrafts.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Deliberately synchronous. Callers save on every autosave tick and on rename,
 * none of which want to await a disk write, and the cache is what the next read
 * returns anyway. The IndexedDB write replicates in the background; if it fails
 * the draft still lives for this page load, which is exactly the old behaviour.
 */
export function saveGuestProjectDraft(draft: GuestProjectDraft) {
  const next = { ...draft, updatedAt: new Date().toISOString() };
  guestDrafts.set(next.id, next);
  void set(next.id, next, draftStore).catch(() => {});
}

export function deleteGuestProjectDraft(id: string) {
  guestDrafts.delete(id);
  void del(id, draftStore).catch(() => {});
}
