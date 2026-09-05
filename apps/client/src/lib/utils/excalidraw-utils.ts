import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { RenderSkeleton } from "@OpenDiagram/harness";
import { estimateTextWidth } from "@OpenDiagram/harness/measure";

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
  fontSize?: number;
}

// Excalidraw 0.18 only remesures text when BOTH flags are set. refreshDimensions
// alone returns before the remesure loop (see restoreElements in the package).
const RESTORE_TEXT = { refreshDimensions: true, repairBindings: true } as const;

const FAMILY_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(FONT_FAMILY_NAMES).map(([id, name]) => [name, Number(id)]),
);

let harnessMetricsInstalled = false;

/**
 * Make Excalidraw measure with the same glyph table the harness used to size
 * nodes. Canvas measureText on refresh runs before Excalifont is in
 * document.fonts, so boxes freeze at fallback widths and stay clipped.
 */
export async function installHarnessTextMetrics() {
  if (harnessMetricsInstalled) return;
  harnessMetricsInstalled = true;
  const { setCustomTextMetricsProvider } = await import("@excalidraw/excalidraw");
  setCustomTextMetricsProvider({
    getLineWidth(text, fontString) {
      const match = /^([\d.]+)px\s+"?([^,"]+)/.exec(fontString);
      const fontSize = match ? Number(match[1]) : 16;
      const familyName = match?.[2]?.replace(/"/g, "").trim() ?? "Excalifont";
      const fontFamily = FAMILY_NAME_TO_ID[familyName];
      return estimateTextWidth(text, fontSize, fontFamily);
    },
  });
}

async function loadSceneFonts(elements: readonly SceneTextElement[]) {
  const loads = new Map<string, string>();
  for (const element of elements) {
    const isText = element.type === "text" || (element as { kind?: string }).kind === "text";
    if (!isText || !element.text || !element.fontFamily) continue;
    const familyName = FONT_FAMILY_NAMES[element.fontFamily];
    if (!familyName) continue;
    const size = element.fontSize ?? 16;
    const key = `${size}px "${familyName}"`;
    loads.set(key, `${loads.get(key) ?? ""}${element.text}`);
  }

  await Promise.allSettled([
    ...[...loads].map(([font, sample]) => document.fonts.load(font, sample)),
    ...Object.values(FONT_FAMILY_NAMES).map((name) => document.fonts.load(`20px "${name}"`)),
  ]);
  await document.fonts.ready;
}

function unlockSavedTextBoxes(elements: readonly unknown[]) {
  return elements.map((element) => {
    if (!element || typeof element !== "object") return element;
    const text = element as { type?: string; containerId?: string | null; autoResize?: boolean };
    if (text.type !== "text" || text.containerId) return element;
    if (text.autoResize !== false) return element;
    return { ...element, autoResize: true };
  });
}

/**
 * Remesure every text box against harness metrics so labels are not clipped.
 * Use on convert, on file load, and once after the Excalidraw API is ready.
 */
export async function repairSceneText(elements: readonly unknown[]) {
  await installHarnessTextMetrics();
  const { restoreElements } = await import("@excalidraw/excalidraw");
  await loadSceneFonts(elements as SceneTextElement[]);
  return restoreElements(unlockSavedTextBoxes(elements) as never[], null, RESTORE_TEXT);
}

/** Loads scene fonts and repairs text bounds that may have used fallback metrics. */
export async function restoreSceneElements(elements: readonly unknown[]) {
  return repairSceneText(elements);
}

/** Second pass after mount: Excalidraw has registered its faces by then. */
export async function repairCanvasText(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElements();
  if (elements.length === 0) return;
  const repaired = await repairSceneText(elements);
  api.updateScene({ elements: repaired });
}

function afterPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

const VIEWPORT_ZOOM_FACTOR = 0.85;
const MIN_FIT_ZOOM = 0.1;
const MAX_FIT_ZOOM = 30;
/** Keep the floating assistant bar / zoom footer off the fitted diagram. */
const ASSISTANT_BAR_BOTTOM = 88;

type CanvasOffsets = { left?: number; right?: number; top?: number; bottom?: number };

type FitApi = Pick<ExcalidrawImperativeAPI, "updateScene" | "getAppState"> & {
  getEditorUIOffsets?: () => CanvasOffsets;
  refresh?: () => void;
};

function fitOffsets(api: FitApi): CanvasOffsets {
  const ui = api.getEditorUIOffsets?.() ?? {};
  return {
    top: ui.top ?? 0,
    left: ui.left ?? 0,
    right: ui.right ?? 0,
    bottom: Math.max(ui.bottom ?? 0, ASSISTANT_BAR_BOTTOM),
  };
}

/**
 * Fit-to-viewport camera (may zoom in past 100%). Same scroll math as
 * Excalidraw `centerScrollOn`. Applied via `updateScene` so it lands even when
 * `scrollToContent` → `setState` is a no-op.
 */
function cameraToFit(
  elements: readonly { x: number; y: number; width: number; height: number }[],
  viewport: { width: number; height: number },
  offsets?: CanvasOffsets,
) {
  const bounds = contentBounds(elements);
  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  const left = offsets?.left ?? 0;
  const right = offsets?.right ?? 0;
  const top = offsets?.top ?? 0;
  const bottom = offsets?.bottom ?? 0;
  const effectiveW = Math.max(1, viewport.width - left - right);
  const effectiveH = Math.max(1, viewport.height - top - bottom);
  const zoom = Math.min(
    MAX_FIT_ZOOM,
    Math.max(
      MIN_FIT_ZOOM,
      Math.min(effectiveW / contentW, effectiveH / contentH) * VIEWPORT_ZOOM_FACTOR,
    ),
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    zoom: { value: zoom },
    scrollX: (viewport.width - right) / 2 / zoom - centerX + left / 2 / zoom,
    scrollY: (viewport.height - bottom) / 2 / zoom - centerY + top / 2 / zoom,
  };
}

function viewportSize(api: Pick<ExcalidrawImperativeAPI, "getAppState">) {
  const appState = api.getAppState();
  return {
    width: appState.width || (typeof window !== "undefined" ? window.innerWidth : 1440),
    height: appState.height || (typeof window !== "undefined" ? window.innerHeight : 900),
  };
}

function sizedElements(elements: readonly unknown[]) {
  return elements.filter((el): el is { x: number; y: number; width: number; height: number } => {
    if (!el || typeof el !== "object") return false;
    const value = el as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
    return (
      typeof value.x === "number" &&
      typeof value.y === "number" &&
      typeof value.width === "number" &&
      typeof value.height === "number"
    );
  });
}

/** Center the diagram and zoom so it fills the editor viewport. */
export function fitSceneToViewport(api: FitApi, elements: readonly unknown[]) {
  const sized = sizedElements(elements);
  if (sized.length === 0) return;
  api.updateScene({
    appState: {
      ...cameraToFit(sized, viewportSize(api), fitOffsets(api)),
      isLoading: false,
    },
    captureUpdate: "NEVER",
  });
  api.refresh?.();
}

/** collaborators is a Map and does not survive JSON. */
export function sanitizeSceneAppState(appState: unknown) {
  if (!appState || typeof appState !== "object") return appState;
  const {
    collaborators: _collaborators,
    isLoading: _isLoading,
    ...rest
  } = appState as Record<string, unknown>;
  return rest;
}

export function sceneElementsVersion(elements: readonly unknown[]) {
  return JSON.stringify(
    elements.map((element, index) => {
      if (!element || typeof element !== "object") return [index, "", 0];
      const value = element as { id?: unknown; version?: unknown };
      return [index, typeof value.id === "string" ? value.id : "", value.version ?? 0];
    }),
  );
}

export async function sceneToInitialData(scene: unknown) {
  if (!scene || typeof scene !== "object") return null;
  const value = scene as { elements?: unknown; appState?: unknown; files?: unknown };
  if (!Array.isArray(value.elements) || value.elements.length === 0) {
    return {
      elements: Array.isArray(value.elements) ? value.elements : [],
      appState: sanitizeSceneAppState(value.appState),
      files: value.files,
    };
  }
  const elements = await repairSceneText(value.elements);
  return {
    elements,
    appState: sanitizeSceneAppState(value.appState),
    files: value.files,
    // Origin cameras from a draw that fitted before the scene committed.
    scrollToContent: true,
  };
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

const FRAME_PADDING = 10;

function fitFrameToChildren(
  elements: readonly { type: string; frameId?: string | null; id: string }[],
) {
  const frame = elements.find((el) => el.type === "frame") as
    | { type: "frame"; x: number; y: number; width: number; height: number; id: string }
    | undefined;
  if (!frame) return;
  const children = elements.filter(
    (el) => "frameId" in el && el.frameId === frame.id,
  ) as unknown as {
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  if (children.length === 0) return;
  const bounds = contentBounds(children);
  Object.assign(frame, {
    x: bounds.minX - FRAME_PADDING,
    y: bounds.minY - FRAME_PADDING,
    width: bounds.maxX - bounds.minX + FRAME_PADDING * 2,
    height: bounds.maxY - bounds.minY + FRAME_PADDING * 2,
  });
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
  const { convertToExcalidrawElements, restoreElements, CaptureUpdateAction } =
    await import("@excalidraw/excalidraw");
  // Measure AFTER the real face is in document.fonts. convertToExcalidrawElements
  // freezes text width/height from canvas measureText; Fonts.onLoaded later
  // redraws but does not grow the box, so a fallback measure clips the label.
  await installHarnessTextMetrics();
  await loadSceneFonts([
    ...skeletons.filter((s): s is Extract<RenderSkeleton, { kind: "text" }> => s.kind === "text"),
    ...(rawElements as SceneTextElement[]),
  ]);
  const generated = convertToExcalidrawElements([
    ...skeletons.map(toElementSkeleton),
    ...(rawElements as ExcalidrawElementSkeleton[]),
  ]);
  const converted = restoreElements(generated, null, RESTORE_TEXT);
  fitFrameToChildren(converted);

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

  const nextElements = [...kept, ...converted];
  const frame = converted.find((el) => el.type === "frame");
  const fitTarget = sizedElements(frame ? [frame] : converted);
  api.updateScene({
    elements: nextElements,
    appState: {
      ...cameraToFit(
        fitTarget.length > 0 ? fitTarget : sizedElements(converted),
        viewportSize(api),
        fitOffsets(api),
      ),
      isLoading: false,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.refresh();
  await afterPaint();
  return { frameId: frame?.id ?? null };
}
