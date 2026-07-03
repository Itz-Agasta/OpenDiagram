export type GuestProjectDraft = {
  id: string;
  name: string;
  description?: string;
  scene?: unknown;
  spec?: unknown;
  createdAt: string;
  updatedAt: string;
};

const draftPrefix = "opendiagram:guest-project:";

export function createGuestProjectDraft(name: string): GuestProjectDraft {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  };
}

export function getGuestProjectDraft(id: string): GuestProjectDraft | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(`${draftPrefix}${id}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as GuestProjectDraft;
  } catch {
    return null;
  }
}

export function listGuestProjectDrafts(): GuestProjectDraft[] {
  if (typeof window === "undefined") return [];

  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith(draftPrefix))
    .map((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;

      try {
        return JSON.parse(raw) as GuestProjectDraft;
      } catch {
        return null;
      }
    })
    .filter((draft): draft is GuestProjectDraft => Boolean(draft))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveGuestProjectDraft(draft: GuestProjectDraft) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    `${draftPrefix}${draft.id}`,
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
  );
}

export function deleteGuestProjectDraft(id: string) {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(`${draftPrefix}${id}`);
}
