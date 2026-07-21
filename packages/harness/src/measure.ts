import type { DiagramEdge, DiagramNode, EntityColumn } from "./schema.js";
import type { Theme } from "./theme/index.js";

import { FONT_METRICS } from "./font-metrics.js";

/**
 * Server-safe text metrics: no canvas available, so widths come from
 * pre-measured per-glyph tables (font-metrics.ts) for the fonts diagrams use.
 * Fonts without a table fall back to a generous 0.62em-per-char heuristic.
 */
const AVG_CHAR_WIDTH = 0.62; // fallback for fonts without a metrics table
const LINE_HEIGHT = 1.25;
// Per-glyph sums ignore kerning and canvas rounding — small cushion so a
// label can never end up a pixel wider than the box reserved for it.
const SAFETY = 1.03;

export function estimateTextWidth(text: string, fontSize: number, fontFamily?: number): number {
  const metrics = fontFamily !== undefined ? FONT_METRICS[fontFamily] : undefined;
  // LLMs sometimes emit multi-line labels despite instructions — measure the
  // longest line, not the raw string length.
  const lines = text.split("\n");
  if (!metrics) {
    const longest = Math.max(...lines.map((line) => line.length));
    return Math.ceil(longest * fontSize * AVG_CHAR_WIDTH);
  }
  let widest = 0;
  for (const line of lines) {
    let width = 0;
    for (const ch of line) width += metrics.ratios[ch] ?? metrics.avg;
    widest = Math.max(widest, width);
  }
  return Math.ceil(widest * fontSize * SAFETY);
}

export function estimateTextHeight(fontSize: number, lines = 1): number {
  return Math.round(fontSize * LINE_HEIGHT * lines);
}

export function countTextLines(text: string): number {
  return text.split("\n").length;
}

/**
 * Node footprint.
 * - "card" mode: contained nodes render as cards (box + icon band + label),
 *   top-level nodes render solo (big boxless icon + label underneath).
 * - "icon" mode (handdrawn): every node with an icon renders solo; icon-less
 *   nodes render as a mermaid-style box with the label centered inside.
 */
/**
 * Column row text: name on the left, "type · PK/FK" on the right. Shared by
 * measurement and the renderer so a row can never outgrow its table.
 */
export function entityColumnTexts(column: EntityColumn): { left: string; right: string } {
  return {
    left: column.name,
    right: [column.type, column.key?.toUpperCase()].filter(Boolean).join(" · "),
  };
}

export function nodeSize(
  node: DiagramNode,
  theme: Theme,
  contained: boolean,
): { width: number; height: number } {
  // ERD entity table: header band + one row per column, regardless of theme.
  if (node.columns && node.columns.length > 0) {
    const { entity, text } = theme;
    const headerWidth = estimateTextWidth(node.label, text.nodeLabel.size, theme.fontFamily);
    let rowWidth = 0;
    for (const column of node.columns) {
      const { left, right } = entityColumnTexts(column);
      // 24 = min gap between the name and the right-aligned type text.
      const width =
        estimateTextWidth(left, entity.fontSize, theme.fontFamily) +
        (right ? estimateTextWidth(right, entity.fontSize, theme.fontFamily) + 24 : 0);
      rowWidth = Math.max(rowWidth, width);
    }
    return {
      width: Math.max(entity.minWidth, Math.max(headerWidth, rowWidth) + entity.paddingX * 2),
      height: entity.headerHeight + node.columns.length * entity.rowHeight + entity.padBottom,
    };
  }

  if (theme.nodeMode === "icon" && !node.icon) {
    const { boxNode, text } = theme;
    const labelWidth = estimateTextWidth(node.label, text.nodeLabel.size, theme.fontFamily);
    const sublabelWidth = node.sublabel
      ? estimateTextWidth(node.sublabel, text.nodeSublabel.size, theme.fontFamily)
      : 0;
    return {
      width: Math.max(boxNode.minWidth, Math.max(labelWidth, sublabelWidth) + boxNode.paddingX * 2),
      height:
        boxNode.paddingY * 2 + boxNode.labelHeight + (node.sublabel ? boxNode.sublabelHeight : 0),
    };
  }

  if (theme.nodeMode === "icon" || !contained) {
    const { solo, text } = theme;
    const labelWidth = estimateTextWidth(node.label, text.soloLabel.size, theme.fontFamily);
    const sublabelWidth = node.sublabel
      ? estimateTextWidth(node.sublabel, text.soloSublabel.size, theme.fontFamily)
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
  const labelWidth = estimateTextWidth(node.label, text.nodeLabel.size, theme.fontFamily);
  const sublabelWidth = node.sublabel
    ? estimateTextWidth(node.sublabel, text.nodeSublabel.size, theme.fontFamily)
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
