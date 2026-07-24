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

// Guest workspaces are intentionally ephemeral. This survives client-side
// navigation but is lost on refresh, tab close, or a new browser session.
const guestDrafts = new Map<string, GuestProjectDraft>();
const legacyDraftPrefix = "opendiagram:guest-project:";

function clearLegacyDrafts() {
  if (typeof window === "undefined") return;
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(legacyDraftPrefix)) window.localStorage.removeItem(key);
  }
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

export function getGuestProjectDraft(id: string): GuestProjectDraft | null {
  clearLegacyDrafts();
  return guestDrafts.get(id) ?? null;
}

export function listGuestProjectDrafts(): GuestProjectDraft[] {
  clearLegacyDrafts();
  return [...guestDrafts.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveGuestProjectDraft(draft: GuestProjectDraft) {
  guestDrafts.set(draft.id, { ...draft, updatedAt: new Date().toISOString() });
}

export function deleteGuestProjectDraft(id: string) {
  guestDrafts.delete(id);
}
