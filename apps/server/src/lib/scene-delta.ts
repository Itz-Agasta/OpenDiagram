import { z } from "zod";

/**
 * Merging canvas scene deltas.
 *
 * The canvas used to PATCH its whole scene on every save (70 kB avg, 248 kB max,
 * several times a minute). A delta carries only the elements whose Excalidraw
 * version moved since the client's last acknowledged revision, a couple kB in
 * the common case.
 *
 * Buys wire bytes, not database time. Postgres rewrites the whole TOASTed jsonb
 * value either way, so write cost is unchanged until the scene moves out of the
 * row entirely.
 *
 * TODO: move scene to R2 and keep only a key + revision on the row. That removes
 * the TOAST rewrite, the WAL churn, and the 16x bloat on project_file_content.
 * Both Excalidraw and tldraw hold blobs in object storage keyed by their own id.
 * This module is the seam: mergeSceneDelta already produces the whole next scene,
 * so the writer behind it can become a PUT without the wire format changing.
 */

/**
 * A delta is told from a full scene by these two fields, so both are required.
 *
 * A null base means merge unconditionally. Only the unload beacon sends that: it
 * is the one write with nothing alive to read a 409 or retry it, and a keepalive
 * body cannot carry a whole scene instead (64 KiB quota, our scenes average 70).
 * Merging is still the safer half of that trade, since it keeps concurrent
 * changes this client never saw where a full-scene overwrite would drop them.
 */
export const sceneDeltaSchema = z.object({
  base: z.number().int().nonnegative().nullable(),
  changed: z.array(z.unknown()),
  appState: z.unknown().optional(),
  files: z.record(z.string(), z.unknown()).optional(),
});

export type SceneDelta = z.infer<typeof sceneDeltaSchema>;

type SceneElement = { id?: unknown; index?: unknown };
type StoredScene = { elements?: unknown; appState?: unknown; files?: unknown };

/**
/** Whether a PATCH body's scene is a delta rather than a whole scene.
 *
 * Checked before parsing because scene is z.unknown() on the route. The two
 * shapes are structurally disjoint (stored scene has elements, delta has base +
 * changed), and a Zod union over unknown would have to describe the stored scene
 * too, which nothing else needs.
 */
export function isSceneDelta(scene: unknown): boolean {
  if (!scene || typeof scene !== "object") return false;
  const value = scene as { base?: unknown; changed?: unknown };
  // elements has to be absent, not merely ignored. This runs on a request body,
  // so a client sending a whole scene that happens to carry base and changed
  // would otherwise have its elements silently dropped by the merge.
  const hasBase = typeof value.base === "number" || value.base === null;
  return hasBase && Array.isArray(value.changed) && !("elements" in value);
}

function elementId(element: unknown): string | null {
  if (!element || typeof element !== "object") return null;
  const id = (element as SceneElement).id;
  return typeof id === "string" ? id : null;
}

/**
 * Order by Excalidraw's fractional index, the way orderByFractionalIndex does.
 *
 * Z-order is carried on the element as index ("a0", "c1PO"), not by array
 * position. zindex.ts reorders through syncMovedIndices -> mutateElement, which
 * bumps version. So a send-to-back arrives in the delta like any other edit and
 * needs no separate ordering channel.
 *
 * Sorting is skipped unless every element carries an index. Scenes drawn before
 * fractional indices existed have none; for those the array order IS the z-order,
 * sorting them would shuffle the canvas.
 */
function orderElements(elements: unknown[]): unknown[] {
  const indexOf = (element: unknown) => (element as SceneElement | null)?.index as string;
  if (!elements.every((element) => typeof indexOf(element) === "string")) return elements;

  return [...elements].sort((a, b) => {
    if (indexOf(a) !== indexOf(b)) return indexOf(a) < indexOf(b) ? -1 : 1;
    // Same tie-break as upstream, so two clients that both hold a duplicated
    // index still agree on the resulting order.
    return (elementId(a) ?? "").localeCompare(elementId(b) ?? "");
  });
}

/**
 * Apply a delta to the stored scene, returning the whole next scene.
 *
 * Deletions need no channel of their own: Excalidraw marks a removed element
 * isDeleted: true and bumps its version rather than dropping it from the array,
 * so a deletion arrives as an ordinary changed element. Tombstones are never
 * collected; upstream expires them at DELETED_ELEMENT_TIMEOUT (24h) and we have
 * no equivalent yet.
 *
 * appState is ~1 kB of viewport and theme, replaced wholesale. files is merged
 * rather than replaced, because a delta only carries blobs the client knows the
 * server has not seen.
 */
export function mergeSceneDelta(current: unknown, delta: SceneDelta): unknown {
  const stored = (current ?? {}) as StoredScene;
  const elements = Array.isArray(stored.elements) ? [...stored.elements] : [];

  const positions = new Map<string, number>();
  elements.forEach((element, position) => {
    const id = elementId(element);
    if (id !== null) positions.set(id, position);
  });

  for (const element of delta.changed) {
    const id = elementId(element);
    if (id === null) continue;
    const position = positions.get(id);
    if (position === undefined) {
      positions.set(id, elements.length);
      elements.push(element);
    } else {
      elements[position] = element;
    }
  }

  const files = { ...(stored.files as Record<string, unknown>), ...delta.files };

  return {
    elements: orderElements(elements),
    appState: delta.appState ?? stored.appState,
    files,
  };
}
