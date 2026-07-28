import type { Metadata } from "next";

export const SITE_NAME = "OpenDiagram";
export const SITE_URL = new URL("https://opendiagram.ink");
export const GITHUB_URL = "https://github.com/Itz-Agasta/OpenDiagram";
export const HOME_TITLE = "OpenDiagram - AI Diagram Generator from Plain Text";
export const HOME_DESCRIPTION =
  "AI diagram generator from plain text. Turn ideas, processes, and systems into editable diagrams for work, planning, and software design.";

const PUBLIC_ASSET_PREFIX = process.env.NEXT_PUBLIC_ASSET_URL?.replace(/\/$/, "");

export function assetUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return PUBLIC_ASSET_PREFIX ? `${PUBLIC_ASSET_PREFIX}/public${normalizedPath}` : normalizedPath;
}

export function createPrivateMetadata(title: string): Metadata {
  return {
    title,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
  };
}
