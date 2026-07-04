import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { RenderSkeleton } from "@OpenDiagram/harness";

const NEW_DIAGRAM_GAP = 160;

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
        fillStyle: "solid",
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
        // Id-based bindings snap the visible endpoints to the bound cards'
        // edges; interior bend points from the layout engine are preserved.
        start: skeleton.startId ? { id: skeleton.startId } : undefined,
        end: skeleton.endId ? { id: skeleton.endId } : undefined,
        strokeColor: skeleton.strokeColor,
        strokeStyle: skeleton.strokeStyle,
        strokeWidth: skeleton.strokeWidth,
        roughness: skeleton.roughness,
        startArrowhead: skeleton.startArrowhead === "none" ? null : skeleton.startArrowhead,
        endArrowhead: skeleton.endArrowhead === "none" ? null : skeleton.endArrowhead,
      } as ExcalidrawElementSkeleton;
    case "frame":
      return {
        type: "frame",
        id: skeleton.id,
        name: skeleton.name,
        children: skeleton.children,
      };
  }
}

function contentBounds(
  elements: readonly { x: number; y: number; width: number; height: number }[],
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
  }
  return { minX, minY, maxX };
}

export interface ApplyDiagramResult {
  /** Scene id of the diagram's frame — pass back as `replaceFrameId` to redraw in place. */
  frameId: string | null;
}

/**
 * Pushes a generated diagram onto the Excalidraw canvas **additively**: the
 * existing scene is kept, the new frame is placed in fresh space to its right,
 * and the camera pans to it. `replaceFrameId` swaps a previously generated
 * diagram (its frame + members) in place instead -- used when the agent updates
 * an existing diagram.
 *
 * `rawElements` are pre-formed icon clones (already full Excalidraw element
 * JSON) -- `convertToExcalidrawElements` accepts them alongside skeletons and
 * normalizes both consistently, regenerating every id so repeated generations
 * can never collide.
 */
export async function applyDiagramToCanvas(
  api: ExcalidrawImperativeAPI,
  skeletons: RenderSkeleton[],
  rawElements: unknown[],
  opts?: { replaceFrameId?: string | null },
): Promise<ApplyDiagramResult> {
  // Dynamic import: @excalidraw/excalidraw touches `window` at module scope,
  // so it can only be evaluated in the browser, never during Next.js SSR.
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const converted = convertToExcalidrawElements([
    ...skeletons.map(toElementSkeleton),
    ...(rawElements as ExcalidrawElementSkeleton[]),
  ]);

  const scene = api.getSceneElements();
  const kept = opts?.replaceFrameId
    ? scene.filter((el) => el.id !== opts.replaceFrameId && el.frameId !== opts.replaceFrameId)
    : scene;

  if (kept.length > 0 && converted.length > 0) {
    const keptBounds = contentBounds(kept);
    const newBounds = contentBounds(converted);
    const dx = keptBounds.maxX + NEW_DIAGRAM_GAP - newBounds.minX;
    const dy = keptBounds.minY - newBounds.minY;
    for (const el of converted) {
      // Fresh conversion output — safe to mutate before it enters the scene.
      Object.assign(el, { x: el.x + dx, y: el.y + dy });
    }
  }

  api.updateScene({ elements: [...kept, ...converted] });

  const frame = converted.find((el) => el.type === "frame");
  api.scrollToContent(frame ?? converted, { fitToContent: true, animate: true, duration: 400 });
  return { frameId: frame?.id ?? null };
}
