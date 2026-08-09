import {
  updateProjectFile,
  type SavedProjectFile,
  type UpdateProjectFileInput,
} from "./projects-client";

/**
 * The one path every file PATCH takes, so a file is never written twice at once.
 *
 * A single diagram turn used to put three independent PATCHes on the wire against
 * the same row: use-diagram-canvas writing spec per draw_diagram call,
 * use-diagram-chat writing chat history on finish, and canvas autosave writing
 * scene because applying the diagram changed the canvas. Each cost four db round
 * trips inside a transaction, and they raced (autosave had single-flight but the
 * other two bypassed it).
 *
 * Here they coalesce. While a request is in flight, further patches merge into one
 * pending object and go out together, so a burst collapses to one write instead of
 * three. Patches touch disjoint columns in the common case (spec vs history vs
 * scene), and where they overlap the later value wins (last-writer-wins, same as
 * the local-first canvas).
 *
 * Keyed by file id alone, not by project. A file id is a UUID, belongs to exactly
 * one project, so two projects cannot collide on one key.
 *
 * Every writer of the LARGE columns goes through here: autosave, manual Save, the
 * agent's spec and chat-history writes. Rename calls updateProjectFile directly
 * on purpose; name is a column no other writer touches.
 */

type PendingWrite = {
  projectId: string;
  patch: UpdateProjectFileInput;
  /** "full" as soon as any queued caller needs the content echoed back. */
  fields: "full" | "meta";
  resolve: (file: SavedProjectFile) => void;
  reject: (error: unknown) => void;
  promise: Promise<SavedProjectFile>;
};

const inFlight = new Set<string>();
const pending = new Map<string, PendingWrite>();

function createPending(projectId: string, fields: "full" | "meta"): PendingWrite {
  let resolve!: (file: SavedProjectFile) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<SavedProjectFile>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { projectId, patch: {}, fields, resolve, reject, promise };
}

/**
 * Queue a patch for fileId, returning the response the write eventually gets.
 *
 * Callers merged into one request all receive the same response object. That is
 * correct: it is the state of the row after their write, which is what each of
 * them asked for.
 */
export function queueProjectFilePatch(
  projectId: string,
  fileId: string,
  patch: UpdateProjectFileInput,
  fields: "full" | "meta" = "meta",
): Promise<SavedProjectFile> {
  const existing = pending.get(fileId);
  const entry = existing ?? createPending(projectId, fields);
  if (!existing) pending.set(fileId, entry);

  Object.assign(entry.patch, patch);
  // One caller needing the content back forces the whole merged request to full.
  // Downgrading would hand that caller a response with no content to read.
  if (fields === "full") entry.fields = "full";

  if (!inFlight.has(fileId)) void drain(fileId);
  return entry.promise;
}

async function drain(fileId: string): Promise<void> {
  if (inFlight.has(fileId)) return;
  inFlight.add(fileId);
  try {
    // A loop, not recursion: patches queued while a request is in flight must go
    // out after it, and this picks them up without a second entry point.
    for (;;) {
      const entry = pending.get(fileId);
      if (!entry) return;
      pending.delete(fileId);

      try {
        const file = await updateProjectFile(entry.projectId, fileId, entry.patch, entry.fields);
        entry.resolve(file);
      } catch (error) {
        entry.reject(error);
      }
    }
  } finally {
    inFlight.delete(fileId);
  }
}

/**
 * Drop a queued write for a file that is being deleted. Without this, a file
 * removed while its autosave was still queued would be recreated-in-spirit by a
 * PATCH landing after the DELETE, which 404s and surfaces a save error for a file
 * the user deliberately threw away.
 */
export function cancelQueuedProjectFilePatch(fileId: string): void {
  const entry = pending.get(fileId);
  if (!entry) return;
  pending.delete(fileId);
  entry.reject(new Error("File write cancelled."));
}
