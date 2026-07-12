import type { Box } from "../geometry.js";
import { entityColumnTexts, estimateTextWidth } from "../measure.js";
import type { DiagramNode } from "../schema.js";
import type { HarnessIconRegistry, RenderSkeleton } from "../skeleton.js";
import type { Theme } from "../theme/index.js";
import { cloneIconInstance } from "./icons.js";

/**
 * Boxless node (top-level actor/external): big icon, label underneath. An
 * invisible rectangle over the icon area carries the node id so arrows still
 * have something to bind to.
 */
export function renderSoloNode(
  node: DiagramNode,
  box: Box,
  icons: HarnessIconRegistry,
  theme: Theme,
  skeletons: RenderSkeleton[],
  rawElements: Record<string, unknown>[],
): void {
  const { solo, text } = theme;
  const category = theme.categories[node.category ?? ""] ?? theme.defaultCategory;
  const groupId = crypto.randomUUID();
  const iconBox: Box = {
    x: box.x + (box.width - solo.iconSize) / 2,
    y: box.y,
    width: solo.iconSize,
    height: solo.iconSize,
  };

  const icon = node.icon ? icons[node.icon] : undefined;
  if (icon) {
    skeletons.push({
      kind: "container",
      id: node.id,
      shape: "rectangle",
      ...iconBox,
      opacity: 0,
      groupId,
    });
    rawElements.push(...cloneIconInstance(icon.elements, iconBox, groupId, theme.roughness));
  } else {
    // No registry icon: the category glyph itself becomes the bind target.
    skeletons.push({
      kind: "container",
      id: node.id,
      shape: node.category === "database" || node.category === "storage" ? "ellipse" : "rectangle",
      ...iconBox,
      strokeColor: category.stroke,
      backgroundColor: category.fill,
      strokeStyle: "solid",
      strokeWidth: theme.boxNode.strokeWidth,
      rounded: true,
      roughness: theme.roughness,
      groupId,
    });
  }

  const centerX = box.x + box.width / 2;
  const labelY = box.y + solo.iconSize + solo.gapIconLabel;
  skeletons.push({
    kind: "text",
    id: `${node.id}-label`,
    text: node.label,
    x: centerX,
    y: labelY,
    fontSize: text.soloLabel.size,
    fontFamily: theme.fontFamily,
    color: text.soloLabel.color,
    textAlign: "center",
    groupId,
  });
  if (node.sublabel) {
    skeletons.push({
      kind: "text",
      id: `${node.id}-sublabel`,
      text: node.sublabel,
      x: centerX,
      y: labelY + solo.labelHeight,
      fontSize: text.soloSublabel.size,
      fontFamily: theme.fontFamily,
      color: text.soloSublabel.color,
      textAlign: "center",
      groupId,
    });
  }
}

/**
 * Mermaid-style icon-less node ("icon" mode): a box with the label centered
 * inside — no icon band.
 */
export function renderBoxNode(
  node: DiagramNode,
  box: Box,
  theme: Theme,
  out: RenderSkeleton[],
): void {
  const { boxNode, text } = theme;
  const category = theme.categories[node.category ?? ""] ?? theme.defaultCategory;
  const groupId = crypto.randomUUID();

  out.push({
    kind: "container",
    id: node.id,
    shape: node.category === "database" || node.category === "storage" ? "ellipse" : "rectangle",
    ...box,
    strokeColor: node.style?.strokeColor ?? category.stroke,
    backgroundColor: node.style?.backgroundColor ?? category.fill,
    fillStyle: boxNode.fillStyle,
    strokeStyle: node.style?.strokeStyle ?? "solid",
    strokeWidth: node.style?.strokeWidth ?? boxNode.strokeWidth,
    rounded: true,
    roughness: theme.roughness,
    groupId,
  });

  const centerX = box.x + box.width / 2;
  const textBlockHeight = boxNode.labelHeight + (node.sublabel ? boxNode.sublabelHeight : 0);
  const labelY = box.y + (box.height - textBlockHeight) / 2;
  out.push({
    kind: "text",
    id: `${node.id}-label`,
    text: node.label,
    x: centerX,
    y: labelY,
    fontSize: text.nodeLabel.size,
    fontFamily: theme.fontFamily,
    color: text.nodeLabel.color,
    textAlign: "center",
    groupId,
  });
  if (node.sublabel) {
    out.push({
      kind: "text",
      id: `${node.id}-sublabel`,
      text: node.sublabel,
      x: centerX,
      y: labelY + boxNode.labelHeight,
      fontSize: text.nodeSublabel.size,
      fontFamily: theme.fontFamily,
      color: text.nodeSublabel.color,
      textAlign: "center",
      groupId,
    });
  }
}

/**
 * ERD entity: square-cornered table with a category-tinted header band (table
 * name) and one row per column — name left, "type · PK/FK" right. Widths were
 * measured from the same texts in nodeSize, so rows always fit.
 */
export function renderEntityNode(
  node: DiagramNode,
  box: Box,
  theme: Theme,
  out: RenderSkeleton[],
): void {
  const { entity, text } = theme;
  const category = theme.categories[node.category ?? "database"] ?? theme.defaultCategory;
  const groupId = crypto.randomUUID();

  out.push({
    kind: "container",
    id: node.id,
    shape: "rectangle",
    ...box,
    strokeColor: node.style?.strokeColor ?? category.stroke,
    backgroundColor: "#ffffff",
    strokeStyle: "solid",
    strokeWidth: theme.boxNode.strokeWidth,
    roughness: theme.roughness,
    groupId,
  });

  out.push({
    kind: "container",
    id: `${node.id}-header`,
    shape: "rectangle",
    x: box.x,
    y: box.y,
    width: box.width,
    height: entity.headerHeight,
    strokeColor: node.style?.strokeColor ?? category.stroke,
    backgroundColor: node.style?.backgroundColor ?? category.fill,
    strokeStyle: "solid",
    strokeWidth: theme.boxNode.strokeWidth,
    roughness: theme.roughness,
    groupId,
  });
  out.push({
    kind: "text",
    id: `${node.id}-label`,
    text: node.label,
    x: box.x + box.width / 2,
    y: box.y + (entity.headerHeight - text.nodeLabel.size * 1.25) / 2,
    fontSize: text.nodeLabel.size,
    fontFamily: theme.fontFamily,
    color: category.stroke,
    textAlign: "center",
    groupId,
  });

  const lineHeight = entity.fontSize * 1.25;
  (node.columns ?? []).forEach((column, i) => {
    const rowY =
      box.y + entity.headerHeight + i * entity.rowHeight + (entity.rowHeight - lineHeight) / 2;
    const { left, right } = entityColumnTexts(column);
    out.push({
      kind: "text",
      id: `${node.id}-col-${i}`,
      text: left,
      x: box.x + entity.paddingX,
      y: rowY,
      fontSize: entity.fontSize,
      fontFamily: theme.fontFamily,
      color: text.nodeLabel.color,
      textAlign: "left",
      groupId,
    });
    if (right) {
      // Right column is left-aligned at a computed x — estimated width is
      // generous, so the text lands at (or just short of) the right padding.
      out.push({
        kind: "text",
        id: `${node.id}-col-${i}-type`,
        text: right,
        x:
          box.x +
          box.width -
          entity.paddingX -
          estimateTextWidth(right, entity.fontSize, theme.fontFamily),
        y: rowY,
        fontSize: entity.fontSize,
        fontFamily: theme.fontFamily,
        color: text.nodeSublabel.color,
        textAlign: "left",
        groupId,
      });
    }
  });
}

/** Card node: white rounded rect with an icon band on top and labels below. */
export function renderNode(
  node: DiagramNode,
  box: Box,
  icons: HarnessIconRegistry,
  theme: Theme,
  skeletons: RenderSkeleton[],
  rawElements: Record<string, unknown>[],
): void {
  const { card, text } = theme;
  const category = theme.categories[node.category ?? ""] ?? theme.defaultCategory;
  const groupId = crypto.randomUUID();

  skeletons.push({
    kind: "container",
    id: node.id,
    shape: "rectangle",
    ...box,
    strokeColor: node.style?.strokeColor ?? category.stroke,
    backgroundColor: node.style?.backgroundColor ?? card.background,
    strokeStyle: node.style?.strokeStyle ?? "solid",
    strokeWidth: node.style?.strokeWidth ?? card.strokeWidth,
    rounded: true,
    roughness: theme.roughness,
    groupId,
  });

  const iconBox: Box = {
    x: box.x + (box.width - card.iconSize) / 2,
    y: box.y + card.padTop,
    width: card.iconSize,
    height: card.iconSize,
  };
  const icon = node.icon ? icons[node.icon] : undefined;
  if (icon) {
    rawElements.push(...cloneIconInstance(icon.elements, iconBox, groupId, theme.roughness));
  } else {
    // Category glyph fallback so icon-less cards don't have an empty band.
    skeletons.push({
      kind: "container",
      id: `${node.id}-glyph`,
      shape: node.category === "database" || node.category === "storage" ? "ellipse" : "rectangle",
      ...iconBox,
      strokeColor: category.stroke,
      backgroundColor: category.fill,
      strokeStyle: "solid",
      strokeWidth: 1,
      rounded: true,
      roughness: theme.roughness,
      groupId,
    });
  }

  // With textAlign "center", Excalidraw treats x as the anchor the measured
  // text is centered on — so pass the card's horizontal center.
  const centerX = box.x + box.width / 2;
  const labelY = box.y + card.padTop + card.iconSize + card.gapIconLabel;
  skeletons.push({
    kind: "text",
    id: `${node.id}-label`,
    text: node.label,
    x: centerX,
    y: labelY,
    fontSize: text.nodeLabel.size,
    fontFamily: theme.fontFamily,
    color: text.nodeLabel.color,
    textAlign: "center",
    groupId,
  });
  if (node.sublabel) {
    skeletons.push({
      kind: "text",
      id: `${node.id}-sublabel`,
      text: node.sublabel,
      x: centerX,
      y: labelY + card.labelHeight,
      fontSize: text.nodeSublabel.size,
      fontFamily: theme.fontFamily,
      color: text.nodeSublabel.color,
      textAlign: "center",
      groupId,
    });
  }
}
