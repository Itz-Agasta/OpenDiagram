import { classicTheme } from "./classic.js";
import { sketchTheme } from "./sketch.js";

export type { CategoryStyle, ContainerStyle, Theme, ThemeText } from "./types.js";
export { classicTheme } from "./classic.js";
export { sketchTheme } from "./sketch.js";

export const themes = {
  classic: classicTheme,
  sketch: sketchTheme,
} as const;

export type ThemeName = keyof typeof themes;
