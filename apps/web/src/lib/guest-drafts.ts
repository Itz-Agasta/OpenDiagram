import type { ProjectFileType } from "@/lib/projects-client";

export type GuestDraftMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type GuestDraftFile = {
  id: string;
  name: string;
  type?: ProjectFileType;
  scene?: unknown;
  spec?: unknown;
  content?: unknown;
  history?: GuestDraftMessage[];
};

export type GuestProjectDraft = {
  id: string;
  name: string;
  description?: string;
  files: GuestDraftFile[];
  createdAt: string;
  updatedAt: string;
};

const draftPrefix = "opendiagram:guest-project:";

function migrateDraft(raw: Record<string, unknown>): GuestProjectDraft | null {
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  if (typeof raw.createdAt !== "string" || typeof raw.updatedAt !== "string") return null;

  if (Array.isArray(raw.files)) {
    return raw as unknown as GuestProjectDraft;
  }

  const files: GuestDraftFile[] = [
    {
      id: raw.id as string,
      name: "Your first design",
      type: "diagram",
      scene: raw.scene,
      spec: raw.spec,
    },
  ];

  return {
    id: raw.id as string,
    name: raw.name as string,
    description: raw.description as string | undefined,
    files,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
  };
}

function parseDraft(raw: string): GuestProjectDraft | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return migrateDraft(parsed);
  } catch {
    return null;
  }
}

export function createGuestProjectDraft(
  name: string,
  fileName?: string,
  fileType: ProjectFileType = "diagram",
  content?: unknown,
  history?: GuestDraftMessage[],
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
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(`${draftPrefix}${id}`);
  if (!raw) return null;

  return parseDraft(raw);
}

export function listGuestProjectDrafts(): GuestProjectDraft[] {
  if (typeof window === "undefined") return [];

  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith(draftPrefix))
    .map((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return parseDraft(raw);
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
