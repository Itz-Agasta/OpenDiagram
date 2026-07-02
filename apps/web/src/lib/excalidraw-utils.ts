import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { RenderSkeleton } from "@OpenDiagram/harness";

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
        strokeStyle: skeleton.strokeStyle,
        strokeWidth: skeleton.strokeWidth,
        opacity: skeleton.opacity,
        groupIds: skeleton.groupId ? [skeleton.groupId] : undefined,
      };
    case "text":
      return {
        type: "text",
        text: skeleton.text,
        x: skeleton.x,
        y: skeleton.y,
        fontSize: skeleton.fontSize,
        textAlign: skeleton.textAlign,
        groupIds: skeleton.groupId ? [skeleton.groupId] : undefined,
      };
    case "arrow":
      return {
        type: "arrow",
        x: skeleton.x,
        y: skeleton.y,
        // Real start->end vector so Excalidraw has actual line geometry to
        // work with — id-based start/end binding then snaps the visible
        // endpoints to the bound boxes' edges.
        points: [
          [0, 0],
          [skeleton.endX - skeleton.x, skeleton.endY - skeleton.y],
        ],
        start: { id: skeleton.startId },
        end: { id: skeleton.endId },
        label: skeleton.label ? { text: skeleton.label } : undefined,
        startArrowhead: skeleton.startArrowhead === "none" ? null : skeleton.startArrowhead,
        endArrowhead: skeleton.endArrowhead === "none" ? null : skeleton.endArrowhead,
        strokeStyle: skeleton.strokeStyle,
      };
  }
}

/**
 * Pushes a generated diagram onto the Excalidraw canvas. `rawElements` are
 * pre-formed icon clones from the registry (already full Excalidraw element
 * JSON, not skeletons) — they're passed through `convertToExcalidrawElements`
 * alongside the generated skeletons in one call rather than appended
 * afterwards, since that function accepts already-complete elements as one
 * of its skeleton variants and normalizes them (e.g. backfills fractional
 * `index`) consistently with the rest of the scene.
 */
export async function applyDiagramToCanvas(
  api: ExcalidrawImperativeAPI,
  skeletons: RenderSkeleton[],
  rawElements: unknown[],
): Promise<void> {
  // Dynamic import: @excalidraw/excalidraw touches `window` at module scope,
  // so it can only be evaluated in the browser, never during Next.js SSR
  // (this function is only ever called from a client-side event handler).
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const elements = convertToExcalidrawElements([
    ...skeletons.map(toElementSkeleton),
    ...(rawElements as ExcalidrawElementSkeleton[]),
  ]);
  api.updateScene({ elements });
}
