import type { Box } from "../geometry.js";

interface RawExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  groupIds?: string[];
  points?: [number, number][];
  boundElements?: { id: string; type: string }[] | null;
  containerId?: string | null;
  [key: string]: unknown;
}

function freshVolatileId(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Clones a registry icon's raw Excalidraw elements (captured at their
 * original library coordinates) into `box`, remapping every element id and
 * group id so multiple instances of the same icon never collide, sanitizing
 * dangling `boundElements`/`containerId` references that don't survive icon
 * extraction, and wrapping the whole clone in `instanceGroupId` so it drags
 * as one unit with the rest of its card.
 */
export function cloneIconInstance(
  elements: readonly Record<string, unknown>[],
  box: Box,
  instanceGroupId: string,
  roughness: number,
): Record<string, unknown>[] {
  // Icon packs bundle their own caption text baked into the library snapshot --
  // dropped since every card renders its own label.
  const raw = (elements as unknown as RawExcalidrawElement[]).filter((el) => el.type !== "text");
  if (raw.length === 0) return [];

  const minX = Math.min(...raw.map((el) => el.x));
  const minY = Math.min(...raw.map((el) => el.y));
  const maxX = Math.max(...raw.map((el) => el.x + el.width));
  const maxY = Math.max(...raw.map((el) => el.y + el.height));
  const bboxWidth = maxX - minX || 1;
  const bboxHeight = maxY - minY || 1;

  const scale = Math.min(box.width / bboxWidth, box.height / bboxHeight);
  const scaledWidth = bboxWidth * scale;
  const scaledHeight = bboxHeight * scale;
  const targetX = box.x + (box.width - scaledWidth) / 2;
  const targetY = box.y + (box.height - scaledHeight) / 2;

  const idMap = new Map<string, string>();
  for (const el of raw) idMap.set(el.id, crypto.randomUUID());

  const groupIdMap = new Map<string, string>();
  for (const el of raw) {
    for (const gid of el.groupIds ?? []) {
      if (!groupIdMap.has(gid)) groupIdMap.set(gid, crypto.randomUUID());
    }
  }

  return raw.map((el) => {
    const clone: Record<string, unknown> = { ...el };
    clone.id = idMap.get(el.id);
    clone.x = targetX + (el.x - minX) * scale;
    clone.y = targetY + (el.y - minY) * scale;
    clone.width = el.width * scale;
    clone.height = el.height * scale;
    if (el.points) {
      clone.points = el.points.map(([px, py]) => [px * scale, py * scale]);
    }
    clone.groupIds = [
      ...(el.groupIds ?? []).map((gid) => groupIdMap.get(gid) ?? gid),
      instanceGroupId,
    ];
    // Strip all binding metadata: `convertToExcalidrawElements` regenerates
    // every element id but never remaps ids inside boundElements/bindings, so
    // any kept reference dangles and its frame pass throws ("Bound element
    // with id X doesn't exist"). Bindings inside a static icon are decorative
    // library leftovers — dropping them changes nothing visually.
    clone.boundElements = null;
    clone.containerId = null;
    clone.startBinding = null;
    clone.endBinding = null;
    clone.frameId = null;
    clone.roughness = roughness;
    clone.version = 1;
    clone.versionNonce = freshVolatileId();
    clone.seed = freshVolatileId();
    clone.updated = Date.now();
    clone.isDeleted = false;
    return clone;
  });
}
