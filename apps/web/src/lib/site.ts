import type { Metadata } from "next";

export const SITE_NAME = "OpenDiagram";
export const SITE_URL = new URL("https://opendiagram.ink");
export const GITHUB_URL = "https://github.com/Itz-Agasta/OpenDiagram";
export const HOME_TITLE = "OpenDiagram — AI Vibe Diagrams for Software Architecture";
export const HOME_DESCRIPTION =
  "Create editable vibe diagrams for software architecture with AI. Describe a system, shape the design on a visual canvas, and keep diagrams, decisions, and project context connected.";

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
