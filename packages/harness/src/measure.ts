import type { DiagramEdge, DiagramNode } from "./schema.js";
import type { Theme } from "./theme/index.js";

/**
 * Server-safe text metrics: no canvas available, so widths are estimated from
 * an average glyph width for the theme font (Nunito ~0.6em). Estimates are
 * deliberately generous — they feed the layout engine, which reserves space,
 * so over-estimating yields breathing room while under-estimating causes
 * overlap/wrapping.
 */
// TUNABLE: average glyph width as a fraction of fontSize. Raise if labels feel
// cramped / edge-label backing rects clip text; lower for tighter fits.
const AVG_CHAR_WIDTH = 0.62;
const LINE_HEIGHT = 1.25;

export function estimateTextWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * AVG_CHAR_WIDTH);
}

export function estimateTextHeight(fontSize: number): number {
  return Math.round(fontSize * LINE_HEIGHT);
}

/**
 * Node footprint.
 * - "card" mode: contained nodes render as cards (box + icon band + label),
 *   top-level nodes render solo (big boxless icon + label underneath).
 * - "icon" mode (handdrawn): every node with an icon renders solo; icon-less
 *   nodes render as a mermaid-style box with the label centered inside.
 */
export function nodeSize(
  node: DiagramNode,
  theme: Theme,
  contained: boolean,
): { width: number; height: number } {
  if (theme.nodeMode === "icon" && !node.icon) {
    const { boxNode, text } = theme;
    const labelWidth = estimateTextWidth(node.label, text.nodeLabel.size);
    const sublabelWidth = node.sublabel
      ? estimateTextWidth(node.sublabel, text.nodeSublabel.size)
      : 0;
    return {
      width: Math.max(boxNode.minWidth, Math.max(labelWidth, sublabelWidth) + boxNode.paddingX * 2),
      height:
        boxNode.paddingY * 2 + boxNode.labelHeight + (node.sublabel ? boxNode.sublabelHeight : 0),
    };
  }

  if (theme.nodeMode === "icon" || !contained) {
    const { solo, text } = theme;
    const labelWidth = estimateTextWidth(node.label, text.soloLabel.size);
    const sublabelWidth = node.sublabel
      ? estimateTextWidth(node.sublabel, text.soloSublabel.size)
      : 0;
    return {
      width: Math.max(solo.iconSize, labelWidth, sublabelWidth) + 8,
      height:
        solo.iconSize +
        solo.gapIconLabel +
        solo.labelHeight +
        (node.sublabel ? solo.sublabelHeight : 0),
    };
  }

  const { card, text } = theme;
  const labelWidth = estimateTextWidth(node.label, text.nodeLabel.size);
  const sublabelWidth = node.sublabel
    ? estimateTextWidth(node.sublabel, text.nodeSublabel.size)
    : 0;
  const width = Math.max(card.minWidth, Math.max(labelWidth, sublabelWidth) + card.paddingX * 2);
  const height =
    card.padTop +
    card.iconSize +
    card.gapIconLabel +
    card.labelHeight +
    (node.sublabel ? card.sublabelHeight : 0) +
    card.padBottom;
  return { width, height };
}

/** Single source of truth for arrow label text (layout measures it, renderer draws it). */
export function edgeLabelText(edge: DiagramEdge): string | undefined {
  return [edge.label, edge.protocol].filter(Boolean).join(" · ") || undefined;
}
