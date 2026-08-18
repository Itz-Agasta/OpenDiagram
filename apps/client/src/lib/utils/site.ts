export const SITE_NAME = "OpenDiagram";
export const SITE_URL = new URL("https://opendiagram.ink");
export const GITHUB_URL = "https://github.com/Itz-Agasta/OpenDiagram";
export const HOME_TITLE = "OpenDiagram - AI Diagram Generator from Plain Text";
export const HOME_DESCRIPTION =
  "AI diagram generator from plain text. Turn ideas, processes, and systems into editable diagrams for work, planning, and software design.";

const PUBLIC_ASSET_PREFIX = (
  import.meta.env.VITE_PUBLIC_ASSET_URL || "https://media.opendiagram.ink"
).replace(/\/$/, "");

export function assetUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return PUBLIC_ASSET_PREFIX ? `${PUBLIC_ASSET_PREFIX}/public${normalizedPath}` : normalizedPath;
}
