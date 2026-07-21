import type { Box } from "../geometry.js";
import type { RenderSkeleton } from "../skeleton.js";
import type { ContainerStyle, Theme } from "../theme/index.js";

/**
 * Group/zone box: one container path for both, style driven by the theme's
 * container tokens with optional per-group overrides, label top-left inside
 * the padding the layout reserved.
 */
export function renderContainer(
  id: string,
  label: string,
  sublabel: string | undefined,
  style: string | undefined,
  box: Box,
  theme: Theme,
  out: RenderSkeleton[],
  overrides?: { strokeColor?: string; backgroundColor?: string },
  tokensOverride?: ContainerStyle,
): void {
  const tokens = tokensOverride ?? theme.containers[style ?? ""] ?? theme.defaultContainer;
  const groupId = crypto.randomUUID();
  out.push({
    kind: "container",
    id,
    shape: "rectangle",
    ...box,
    strokeColor: overrides?.strokeColor ?? tokens.stroke,
    backgroundColor: overrides?.backgroundColor ?? tokens.fill,
    fillStyle: tokens.fillStyle,
    strokeStyle: tokens.strokeStyle,
    strokeWidth: theme.containerStrokeWidth,
    roughness: theme.roughness,
    groupId,
  });
  out.push({
    kind: "text",
    id: `${id}-label`,
    text: sublabel ? `${label} — ${sublabel}` : label,
    x: box.x + 14,
    y: box.y + 12,
    fontSize: theme.text.containerLabel.size,
    fontFamily: theme.fontFamily,
    color: overrides?.strokeColor ?? tokens.stroke,
    textAlign: "left",
    groupId,
  });
}
