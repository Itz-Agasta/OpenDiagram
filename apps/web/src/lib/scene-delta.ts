/**
 * Encoding a canvas save as a delta instead of a whole scene.
 *
 * The autosave used to PUT its entire scene on every write (70 kB avg, 248 kB
 * max, several times a minute). Almost none of it changed. Excalidraw stamps every
 * element with a version that moves on any mutation, including z-order changes
 * (which travel as the fractional index on the element, not array position), so
 * "what changed" is a comparison, not a diff algorithm.
 *
 * Lives at the transport boundary on purpose. project-file-sync.ts coalesces
 * concurrent writers with Object.assign, which is right for whole scenes (later one
 * wins) and wrong for two deltas (their changed-element sets would need unioning
 * against the older base). Encoding here, one layer below the queue, leaves that
 * merge correct: the queue still passes whole scenes around and only the request
 * on the wire is a delta.
 *
 * The queue also makes the baseline safe to hold in a module-level map: it
 * guarantees at most one in-flight request per file, so no two encodes race for
 * one entry.
 */

type Baseline = {
  rev: number;
  /** Element id to the version the server is known to hold. */
  versions: Map<string, number>;
  /** Ids of binary blobs already uploaded, so they are sent exactly once. */
  fileIds: Set<string>;
};

const baselines = new Map<string, Baseline>();

type Scene = { elements?: unknown; appState?: unknown; files?: unknown };

export type EncodedScene = {
  /** What to send as scene: either a whole scene or { base, changed, ... }. */
  wire: unknown;
  /** Call with the response's sceneRev once the write lands. */
  commit: (sceneRev: number | null | undefined) => void;
};

function readElements(scene: unknown): unknown[] | null {
  if (!scene || typeof scene !== "object") return null;
  const elements = (scene as Scene).elements;
  return Array.isArray(elements) ? elements : null;
}

function versionsOf(elements: readonly unknown[]): Map<string, number> {
  const versions = new Map<string, number>();
  for (const element of elements) {
    if (!element || typeof element !== "object") continue;
    const { id, version } = element as { id?: unknown; version?: unknown };
    if (typeof id === "string") versions.set(id, typeof version === "number" ? version : 0);
  }
  return versions;
}

function fileIdsOf(scene: unknown): Set<string> {
  const files = (scene as Scene | null)?.files;
  if (!files || typeof files !== "object") return new Set();
  return new Set(Object.keys(files as Record<string, unknown>));
}

/**
 * Record what the server holds so the next save can be a delta.
 *
 * Called with the response of a full file read. Seeding from the server's copy is
 * what makes this correct when a dirty local copy wins the reconcile on open:
 * the delta then carries exactly the elements the local copy changed.
 */
export function seedSceneDelta(fileId: string, scene: unknown, sceneRev: unknown): void {
  const elements = readElements(scene);
  if (elements === null || typeof sceneRev !== "number") {
    baselines.delete(fileId);
    return;
  }
  baselines.set(fileId, {
    rev: sceneRev,
    versions: versionsOf(elements),
    fileIds: fileIdsOf(scene),
  });
}

/** Force the next save of this file to carry a whole scene. */
export function resetSceneDelta(fileId: string): void {
  baselines.delete(fileId);
}

export function encodeScene(fileId: string, scene: unknown): EncodedScene {
  const elements = readElements(scene);
  const baseline = baselines.get(fileId);

  const commit = (sceneRev: number | null | undefined) => {
    // No revision back means the content row was not written. Dropping the
    // baseline costs one full scene and cannot desync.
    if (typeof sceneRev !== "number" || elements === null) {
      baselines.delete(fileId);
      return;
    }
    baselines.set(fileId, {
      rev: sceneRev,
      versions: versionsOf(elements),
      fileIds: fileIdsOf(scene),
    });
  };

  // No baseline, or a scene we can't reason about (legacy skeletons payload,
  // explicit null clearing the column, first save after file opens). Send the
  // whole thing and let the response establish the baseline.
  if (baseline === undefined || elements === null) return { wire: scene, commit };

  const changed = elements.filter((element) => {
    if (!element || typeof element !== "object") return true;
    const { id, version } = element as { id?: unknown; version?: unknown };
    if (typeof id !== "string") return true;
    return baseline.versions.get(id) !== (typeof version === "number" ? version : 0);
  });

  // Deletions need no separate channel: Excalidraw keeps removed elements in the
  // array as isDeleted: true with a bumped version, picked up above like any other
  // change.
  const files = (scene as Scene).files;
  const newFiles =
    files && typeof files === "object"
      ? Object.fromEntries(
          Object.entries(files as Record<string, unknown>).filter(
            ([id]) => !baseline.fileIds.has(id),
          ),
        )
      : undefined;

  return {
    wire: {
      base: baseline.rev,
      changed,
      // ~1 kB of viewport and theme, replaced wholesale by the server. Not worth
      // diffing.
      appState: (scene as Scene).appState,
      ...(newFiles && Object.keys(newFiles).length > 0 ? { files: newFiles } : {}),
    },
    commit,
  };
}
