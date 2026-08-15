import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { RenderSkeleton } from "@OpenDiagram/harness";

const NEW_DIAGRAM_GAP = 160;
// TUNABLE: when the current row of diagrams is wider than this, the next
// diagram starts a new row below instead of extending the canvas rightward.
const MAX_ROW_WIDTH = 3600;

const FONT_FAMILY_NAMES: Record<number, string> = {
  1: "Virgil",
  2: "Helvetica",
  3: "Cascadia",
  5: "Excalifont",
  6: "Nunito",
  7: "Lilita One",
  8: "Comic Shanns",
  9: "Liberation Sans",
};

interface SceneTextElement {
  type?: string;
  text?: string;
  fontFamily?: number;
}

async function loadSceneFonts(elements: readonly SceneTextElement[]) {
  const charactersByFont = new Map<number, Set<string>>();
  for (const element of elements) {
    if (element.type !== "text" || !element.text || !element.fontFamily) continue;
    const characters = charactersByFont.get(element.fontFamily) ?? new Set<string>();
    for (const character of element.text) characters.add(character);
    charactersByFont.set(element.fontFamily, characters);
  }

  await Promise.allSettled(
    [...charactersByFont].map(([fontFamily, characters]) => {
      const familyName = FONT_FAMILY_NAMES[fontFamily];
      if (!familyName) return Promise.resolve([]);
      return document.fonts.load(`16px "${familyName}"`, [...characters].join(""));
    }),
  );
  await document.fonts.ready;
}

/** Loads scene fonts and repairs text bounds that may have used fallback metrics. */
export async function restoreSceneElements(elements: readonly unknown[]) {
  const { restoreElements } = await import("@excalidraw/excalidraw");
  await loadSceneFonts(elements as SceneTextElement[]);
  return restoreElements(elements as never[], null, { refreshDimensions: true });
}

function toElementSkeleton(skeleton: RenderSkeleton): ExcalidrawElementSkeleton {
  switch (skeleton.kind) {
    case "container":
      return {
        type: skeleton.shape,
        id: skeleton.id,
        x: skeleton.x,
        y: skeleton.y,
        width: skeleton.width,
        height: skeleton.height,
        strokeColor: skeleton.strokeColor,
        backgroundColor: skeleton.backgroundColor,
        fillStyle: skeleton.fillStyle ?? "solid",
        strokeStyle: skeleton.strokeStyle,
        strokeWidth: skeleton.strokeWidth,
        roughness: skeleton.roughness,
        roundness: skeleton.rounded ? { type: 3 } : null,
        opacity: skeleton.opacity,
        groupIds: skeleton.groupId ? [skeleton.groupId] : undefined,
      };
    case "text":
      return {
        type: "text",
        id: skeleton.id,
        text: skeleton.text,
        x: skeleton.x,
        y: skeleton.y,
        fontSize: skeleton.fontSize,
        fontFamily: skeleton.fontFamily,
        strokeColor: skeleton.color,
        textAlign: skeleton.textAlign,
        groupIds: skeleton.groupId ? [skeleton.groupId] : undefined,
      };
    case "arrow":
      return {
        type: "arrow",
        id: skeleton.id,
        x: skeleton.x,
        y: skeleton.y,
        points: skeleton.points,
        strokeColor: skeleton.strokeColor,
        strokeStyle: skeleton.strokeStyle,
        strokeWidth: skeleton.strokeWidth,
        roughness: skeleton.roughness,
        startArrowhead: skeleton.startArrowhead === "none" ? null : skeleton.startArrowhead,
        endArrowhead: skeleton.endArrowhead === "none" ? null : skeleton.endArrowhead,
        groupIds: skeleton.groupId ? [skeleton.groupId] : undefined,
      } as ExcalidrawElementSkeleton;
    case "frame":
      return {
        type: "frame",
        id: skeleton.id,
        name: skeleton.name,
        children: skeleton.children,
      };
  }
  throw new Error("Unhandled skeleton kind: " + (skeleton as any).kind);
}

function contentBounds(
  elements: readonly { x: number; y: number; width: number; height: number }[],
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { minX, minY, maxX, maxY };
}

export interface ApplyDiagramResult {
  /** Scene id of the diagram's frame — pass back as `replaceFrameId` to redraw in place. */
  frameId: string | null;
}

/**
 * Pushes a generated diagram onto the Excalidraw canvas **additively**: the
 * existing scene is kept, the new frame is placed in fresh space to its right,
 * and the camera pans to it. `replaceFrameId` swaps a previously generated
 * diagram (its frame + members) in place instead, used when the agent updates
 * an existing diagram.
 */
export async function applyDiagramToCanvas(
  api: ExcalidrawImperativeAPI,
  skeletons: RenderSkeleton[],
  rawElements: unknown[],
  opts?: { replaceFrameId?: string | null },
): Promise<ApplyDiagramResult> {
  const { convertToExcalidrawElements, restoreElements } = await import("@excalidraw/excalidraw");
  const generated = convertToExcalidrawElements([
    ...skeletons.map(toElementSkeleton),
    ...(rawElements as ExcalidrawElementSkeleton[]),
  ]);
  await loadSceneFonts(generated);
  const converted = restoreElements(generated, null, { refreshDimensions: true });

  for (const el of converted) {
    if (el.type !== "arrow" && el.type !== "line") continue;
    const points = (el as unknown as { points?: [number, number][] }).points;
    const p0 = points?.[0];
    if (!points || !p0 || (p0[0] === 0 && p0[1] === 0)) continue;
    Object.assign(el, {
      x: el.x + p0[0],
      y: el.y + p0[1],
      points: points.map(([px, py]): [number, number] => [px - p0[0], py - p0[1]]),
    });
  }

  const scene = api.getSceneElements();
  const oldFrame = opts?.replaceFrameId
    ? scene.find((el) => el.id === opts.replaceFrameId)
    : undefined;
  const kept = opts?.replaceFrameId
    ? scene.filter((el) => el.id !== opts.replaceFrameId && el.frameId !== opts.replaceFrameId)
    : scene;

  if (converted.length > 0) {
    const newBounds = contentBounds(converted);
    let dx = 0;
    let dy = 0;
    if (oldFrame) {
      dx = oldFrame.x - newBounds.minX;
      dy = oldFrame.y - newBounds.minY;
    } else if (kept.length > 0) {
      const keptBounds = contentBounds(kept);
      const newWidth = newBounds.maxX - newBounds.minX;
      const frames = kept.filter((el) => el.type === "frame");
      const bottom = frames.reduce<(typeof frames)[number] | null>(
        (acc, f) => (!acc || f.y + f.height > acc.y + acc.height ? f : acc),
        null,
      );
      const row = bottom
        ? frames.filter((f) => f.y < bottom.y + bottom.height && f.y + f.height > bottom.y)
        : [];
      const rowBounds = row.length > 0 ? contentBounds(row) : keptBounds;
      if (rowBounds.maxX + NEW_DIAGRAM_GAP + newWidth - rowBounds.minX > MAX_ROW_WIDTH) {
        dx = keptBounds.minX - newBounds.minX;
        dy = keptBounds.maxY + NEW_DIAGRAM_GAP - newBounds.minY;
      } else {
        dx = rowBounds.maxX + NEW_DIAGRAM_GAP - newBounds.minX;
        dy = rowBounds.minY - newBounds.minY;
      }
    }
    if (dx !== 0 || dy !== 0) {
      for (const el of converted) {
        Object.assign(el, { x: el.x + dx, y: el.y + dy });
      }
    }
  }

  api.updateScene({ elements: [...kept, ...converted] });

  const frame = converted.find((el) => el.type === "frame");
  api.scrollToContent(frame ?? converted, { fitToContent: true, animate: true, duration: 400 });
  return { frameId: frame?.id ?? null };
}
