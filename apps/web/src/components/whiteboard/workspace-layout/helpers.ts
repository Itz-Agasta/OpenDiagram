import type { SavedProjectFile } from "@/lib/projects-client";
import type { WorkspaceSidebarFile } from "@/lib/workspace-layout-store";

export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 360;
export const AGENT_MIN_WIDTH = 300;
export const AGENT_MAX_WIDTH = 560;
export const CONTENT_MIN_WIDTH = 420;
export const AUTOSAVE_DELAY_MS = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type DiagramSceneFields = {
  appState?: unknown;
  files?: unknown;
};

export type ResolvedDiagramScene =
  | (DiagramSceneFields & { kind: "elements"; elements: unknown[] })
  | (DiagramSceneFields & { kind: "legacy"; skeletons: unknown[]; rawElements: unknown[] })
  | (DiagramSceneFields & { kind: "empty" });

export function resolveDiagramScene(scene: unknown): ResolvedDiagramScene {
  if (!scene || typeof scene !== "object") return { kind: "empty" };

  const value = scene as {
    elements?: unknown;
    appState?: unknown;
    files?: unknown;
    rawElements?: unknown;
    skeletons?: unknown;
  };
  const fields = { appState: value.appState, files: value.files };

  // An elements array is the canonical Excalidraw representation. An empty
  // array can mean the user intentionally cleared the canvas, so it must take
  // precedence over any stale legacy renderer payload on the same record.
  if (Array.isArray(value.elements)) {
    return { kind: "elements", elements: value.elements, ...fields };
  }

  const skeletons = Array.isArray(value.skeletons) ? value.skeletons : [];
  const rawElements = Array.isArray(value.rawElements) ? value.rawElements : [];
  if (skeletons.length > 0 || rawElements.length > 0) {
    return { kind: "legacy", skeletons, rawElements, ...fields };
  }

  return { kind: "empty", ...fields };
}

export function hasDiagramScene(scene: unknown) {
  const resolved = resolveDiagramScene(scene);
  return (
    resolved.kind === "legacy" || (resolved.kind === "elements" && resolved.elements.length > 0)
  );
}

function isMeaningfulDiagramSpec(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const spec = value as { type?: unknown; title?: unknown; nodes?: unknown; edges?: unknown };
  return (
    typeof spec.type === "string" &&
    typeof spec.title === "string" &&
    spec.title.trim().length > 0 &&
    Array.isArray(spec.nodes) &&
    spec.nodes.length > 0 &&
    Array.isArray(spec.edges)
  );
}

export function hasDiagramSpec(value: unknown) {
  if (isMeaningfulDiagramSpec(value)) return true;
  if (!value || typeof value !== "object") return false;

  const generated = value as { kind?: unknown; status?: unknown; diagramSpec?: unknown };
  return (
    generated.kind === "repo_generated" &&
    generated.status === "complete" &&
    isMeaningfulDiagramSpec(generated.diagramSpec)
  );
}

export function sanitizeSceneAppState(appState: unknown) {
  if (!appState || typeof appState !== "object") return appState;

  const { collaborators: _collaborators, ...rest } = appState as Record<string, unknown>;

  return rest;
}

export function fileContentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (content == null) return "";

  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return "";
  }
}

export function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "OD";
}

export function toSidebarFile(
  file: Pick<SavedProjectFile, "id" | "name" | "type">,
): WorkspaceSidebarFile {
  return { id: file.id, name: file.name, type: file.type };
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

export function initialElementsVersion(scene: unknown) {
  const elements = (scene as { elements?: unknown })?.elements;
  return Array.isArray(elements) ? sceneElementsVersion(elements) : sceneElementsVersion([]);
}
