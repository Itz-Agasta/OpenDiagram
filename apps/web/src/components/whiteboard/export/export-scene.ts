import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
} from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type ExportFormat = "png" | "jpg" | "svg" | "excalidraw";
export type ExportScale = 1 | 2 | 3;

/**
 * Canvas and selection export as one file. Diagrams export one file each, since
 * an architecture view and a flowchart usually end up on different slides.
 * Each generated diagram is one Excalidraw frame, so diagram ids are frame ids.
 */
export type ExportTarget =
  | { kind: "canvas" }
  | { kind: "selection" }
  | { kind: "diagrams"; ids: string[] };

export type ExportOptions = {
  format: ExportFormat;
  target: ExportTarget;
  scale: ExportScale;
  transparent: boolean;
};

type Part = {
  name: string;
  elements: readonly ExcalidrawElement[];
  frame: ExcalidrawFrameLikeElement | null;
};

function isFrame<T extends ExcalidrawElement>(
  element: T,
): element is T & ExcalidrawFrameLikeElement {
  return element.type === "frame" || element.type === "magicframe";
}

const frameName = (frame: ExcalidrawFrameLikeElement) => frame.name || "Untitled diagram";

export function listFrames(api: ExcalidrawImperativeAPI) {
  return api
    .getSceneElements()
    .filter(isFrame)
    .map((frame) => ({ id: frame.id, name: frameName(frame) }));
}

export function selectedCount(api: ExcalidrawImperativeAPI) {
  return Object.keys(api.getAppState().selectedElementIds).length;
}

function parts(api: ExcalidrawImperativeAPI, target: ExportTarget, fileName: string): Part[] {
  const elements = api.getSceneElements();
  if (target.kind === "canvas") return [{ name: fileName, elements, frame: null }];

  if (target.kind === "selection") {
    const ids = api.getAppState().selectedElementIds;
    // Bound labels and frame members ride along with what was clicked, the way
    // Excalidraw's own "only selected" export treats them.
    const picked = elements.filter(
      (element) =>
        ids[element.id] ||
        ("containerId" in element && element.containerId && ids[element.containerId]) ||
        (element.frameId && ids[element.frameId]),
    );
    return [{ name: fileName, elements: picked, frame: null }];
  }

  const ids = new Set(target.ids);
  return elements
    .filter(isFrame)
    .filter((frame) => ids.has(frame.id))
    .map((frame) => ({
      name: frameName(frame),
      elements: elements.filter((el) => el.id === frame.id || el.frameId === frame.id),
      frame,
    }));
}

/** Output size in px of a single-file export, for the "2400 x 1600 px" hint. */
export async function exportSize(api: ExcalidrawImperativeAPI, options: ExportOptions) {
  const [part, ...rest] = parts(api, options.target, "");
  if (!part?.elements.length || rest.length) return null;
  const { exportToCanvas } = await import("@excalidraw/excalidraw");
  // Excalidraw's own measurement, read off getDimensions. Computing bounds here
  // misses the frame title label it draws above a frame. The 1px canvas keeps
  // the render it does afterwards free.
  let size = { width: 0, height: 0 };
  await exportToCanvas({
    elements: part.elements,
    appState: api.getAppState(),
    files: api.getFiles(),
    exportingFrame: part.frame,
    getDimensions: (width: number, height: number) => {
      size = {
        width: Math.round(width * options.scale),
        height: Math.round(height * options.scale),
      };
      return { width: 1, height: 1, scale: 1 / Math.max(width, height) };
    },
  });
  return size;
}

async function render(api: ExcalidrawImperativeAPI, part: Part, options: ExportOptions) {
  const { exportToBlob, exportToSvg, serializeAsJSON } = await import("@excalidraw/excalidraw");
  const files = api.getFiles();
  const appState = {
    ...api.getAppState(),
    // JPG has no alpha channel, so it always gets the canvas background.
    exportBackground: options.format === "jpg" || !options.transparent,
    exportWithDarkMode: false,
  };
  const { elements, frame } = part;

  if (options.format === "excalidraw") {
    const json = serializeAsJSON(elements, appState, files, "local");
    return new Blob([json], { type: "application/vnd.excalidraw+json" });
  }
  if (options.format === "svg") {
    const svg = await exportToSvg({ elements, appState, files, exportingFrame: frame });
    return new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  }
  return exportToBlob({
    elements,
    appState,
    files,
    exportingFrame: frame,
    // Not `appState.exportScale`: exportToBlob reads it only alongside
    // `maxWidthOrHeight`, and otherwise writes 1x.
    getDimensions: (width: number, height: number) => ({
      width: width * options.scale,
      height: height * options.scale,
      scale: options.scale,
    }),
    ...(options.format === "jpg" ? { mimeType: "image/jpeg", quality: 0.92 } : {}),
  });
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  // Attached first: a detached anchor's click starts no download in older Firefox.
  document.body.append(link);
  link.click();
  link.remove();
  // Deferred: some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "diagram";
}

export async function exportScene(
  api: ExcalidrawImperativeAPI,
  options: ExportOptions,
  fileName: string,
) {
  const picked = parts(api, options.target, fileName).filter((part) => part.elements.length);
  if (!picked.length) throw new Error("Nothing to export.");
  const ext = options.format;

  if (picked.length === 1) {
    download(await render(api, picked[0], options), `${safeName(picked[0].name)}.${ext}`);
    return;
  }

  const { zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (const part of picked) {
    const base = safeName(part.name);
    let name = `${base}.${ext}`;
    // Two diagrams can share a title; the second would overwrite the first.
    for (let n = 2; entries[name]; n++) name = `${base} (${n}).${ext}`;
    entries[name] = new Uint8Array(await (await render(api, part, options)).arrayBuffer());
  }
  // PNG and JPG are compressed already; deflating them again only costs time.
  const level = ext === "png" || ext === "jpg" ? 0 : 6;
  const zip = zipSync(entries, { level });
  download(new Blob([zip], { type: "application/zip" }), `${safeName(fileName)}.zip`);
}
