import type { SavedProjectFile } from "@/lib/projects-client";
import type { WorkspaceSidebarFile } from "@/lib/workspace-layout-store";

export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 360;
export const AGENT_MIN_WIDTH = 300;
export const AGENT_MAX_WIDTH = 560;
export const CONTENT_MIN_WIDTH = 420;
export const AUTOSAVE_DELAY_MS = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

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
  let version = 0;
  for (const element of elements) {
    if (element && typeof element === "object" && "version" in element) {
      const value = (element as { version?: unknown }).version;
      if (typeof value === "number") version += value;
    }
  }
  return version;
}

export function initialElementsVersion(scene: unknown) {
  const elements = (scene as { elements?: unknown })?.elements;
  return Array.isArray(elements) ? sceneElementsVersion(elements) : 0;
}
