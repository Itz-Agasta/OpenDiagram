import type { Box, PositionedSpec } from "./layout.js";
import { edgeLabelText } from "./measure.js";
import type { DiagramEdge, DiagramNode } from "./schema.js";
import { classicTheme, type ContainerStyle, type Theme } from "./theme/index.js";

export interface HarnessIconEntry {
  id: string;
  elements: readonly Record<string, unknown>[];
}

export type HarnessIconRegistry = Record<string, HarnessIconEntry>;

export type RenderSkeleton =
  | {
      kind: "container";
      id: string;
      shape: "rectangle" | "ellipse" | "diamond";
      x: number;
      y: number;
      width: number;
      height: number;
      strokeColor?: string;
      backgroundColor?: string;
      strokeStyle?: "solid" | "dashed" | "dotted";
      /** Excalidraw fill pattern — defaults to "solid" when omitted. */
      fillStyle?: "solid" | "hachure" | "cross-hatch";
      strokeWidth?: number;
      rounded?: boolean;
      roughness?: number;
      opacity?: number;
      groupId?: string;
    }
  | {
      kind: "text";
      id: string;
      text: string;
      /** With textAlign "center", x is the anchor the text is centered on. */
      x: number;
      y: number;
      fontSize: number;
      fontFamily?: number;
      color?: string;
      textAlign?: "left" | "center" | "right";
      groupId?: string;
    }
  | {
      kind: "arrow";
      id: string;
      x: number;
      y: number;
      /** Polyline relative to (x, y) — first point is [0, 0]. */
      points: [number, number][];
      startId?: string;
      endId?: string;
      strokeColor?: string;
      strokeStyle?: "solid" | "dashed" | "dotted";
      strokeWidth?: number;
      roughness?: number;
      startArrowhead: "none" | "arrow" | "triangle" | "circle" | "bar";
      endArrowhead: "none" | "arrow" | "triangle" | "circle" | "bar";
    }
  | {
      kind: "frame";
      id: string;
      name: string;
      children: string[];
    };

export interface RenderResult {
  skeletons: RenderSkeleton[];
  rawElements: Record<string, unknown>[];
}

interface RawExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  groupIds?: string[];
  points?: [number, number][];
  boundElements?: { id: string; type: string }[] | null;
  containerId?: string | null;
  [key: string]: unknown;
}

function freshVolatileId(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Clones a registry icon's raw Excalidraw elements (captured at their
 * original library coordinates) into `box`, remapping every element id and
 * group id so multiple instances of the same icon never collide, sanitizing
 * dangling `boundElements`/`containerId` references that don't survive icon
 * extraction, and wrapping the whole clone in `instanceGroupId` so it drags
 * as one unit with the rest of its card.
 */
function cloneIconInstance(
  elements: readonly Record<string, unknown>[],
  box: Box,
  instanceGroupId: string,
  roughness: number,
): Record<string, unknown>[] {
  // Icon packs bundle their own caption text baked into the library snapshot --
  // dropped since every card renders its own label.
  const raw = (elements as unknown as RawExcalidrawElement[]).filter((el) => el.type !== "text");
  if (raw.length === 0) return [];

  const minX = Math.min(...raw.map((el) => el.x));
  const minY = Math.min(...raw.map((el) => el.y));
  const maxX = Math.max(...raw.map((el) => el.x + el.width));
  const maxY = Math.max(...raw.map((el) => el.y + el.height));
  const bboxWidth = maxX - minX || 1;
  const bboxHeight = maxY - minY || 1;

  const scale = Math.min(box.width / bboxWidth, box.height / bboxHeight);
  const scaledWidth = bboxWidth * scale;
  const scaledHeight = bboxHeight * scale;
  const targetX = box.x + (box.width - scaledWidth) / 2;
  const targetY = box.y + (box.height - scaledHeight) / 2;

  const idMap = new Map<string, string>();
  for (const el of raw) idMap.set(el.id, crypto.randomUUID());

  const groupIdMap = new Map<string, string>();
  for (const el of raw) {
    for (const gid of el.groupIds ?? []) {
      if (!groupIdMap.has(gid)) groupIdMap.set(gid, crypto.randomUUID());
    }
  }

  return raw.map((el) => {
    const clone: Record<string, unknown> = { ...el };
    clone.id = idMap.get(el.id);
    clone.x = targetX + (el.x - minX) * scale;
    clone.y = targetY + (el.y - minY) * scale;
    clone.width = el.width * scale;
    clone.height = el.height * scale;
    if (el.points) {
      clone.points = el.points.map(([px, py]) => [px * scale, py * scale]);
    }
    clone.groupIds = [
      ...(el.groupIds ?? []).map((gid) => groupIdMap.get(gid) ?? gid),
      instanceGroupId,
    ];
    // Strip all binding metadata: `convertToExcalidrawElements` regenerates
    // every element id but never remaps ids inside boundElements/bindings, so
    // any kept reference dangles and its frame pass throws ("Bound element
    // with id X doesn't exist"). Bindings inside a static icon are decorative
    // library leftovers — dropping them changes nothing visually.
    clone.boundElements = null;
    clone.containerId = null;
    clone.startBinding = null;
    clone.endBinding = null;
    clone.frameId = null;
    clone.roughness = roughness;
    clone.version = 1;
    clone.versionNonce = freshVolatileId();
    clone.seed = freshVolatileId();
    clone.updated = Date.now();
    clone.isDeleted = false;
    return clone;
  });
}

function renderContainer(
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

/**
 * Boxless node (top-level actor/external): big icon, label underneath. An
 * invisible rectangle over the icon area carries the node id so arrows still
 * have something to bind to.
 */
function renderSoloNode(
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
function renderBoxNode(node: DiagramNode, box: Box, theme: Theme, out: RenderSkeleton[]): void {
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

function renderNode(
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

function renderEdge(
  edge: DiagramEdge & { id: string },
  route: { points: { x: number; y: number }[]; label?: Box },
  theme: Theme,
  out: RenderSkeleton[],
): void {
  const [start, ...rest] = route.points;
  if (!start || rest.length === 0) return;
  const strokeStyle = edge.style ?? theme.edge.kind[edge.kind ?? "sync"];
  // "arrow" from the spec means "the default head" — each theme picks its own.
  const defaultHead = theme.edge.arrowhead;
  const normalizeHead = (head: "none" | "arrow" | "circle" | "bar") =>
    head === "arrow" ? defaultHead : head;
  out.push({
    kind: "arrow",
    id: edge.id,
    x: start.x,
    y: start.y,
    // ELK's orthogonal route, bends included — labels were measured against
    // this exact path, so it must be drawn verbatim.
    points: [[0, 0], ...rest.map((p): [number, number] => [p.x - start.x, p.y - start.y])],
    startId: edge.from,
    endId: edge.to,
    strokeColor: theme.edge.stroke,
    strokeStyle,
    strokeWidth: theme.edge.strokeWidth,
    roughness: theme.edge.roughness,
    startArrowhead: edge.startArrowhead
      ? normalizeHead(edge.startArrowhead)
      : edge.direction === "bi"
        ? defaultHead
        : "none",
    endArrowhead: edge.endArrowhead ? normalizeHead(edge.endArrowhead) : defaultHead,
  });

  const text = edgeLabelText(edge);
  if (text && route.label) {
    const groupId = crypto.randomUUID();
    // Labels sit inline on the arrow path — a solid backing rect masks the
    // line behind the text (eraser.io style).
    out.push({
      kind: "container",
      id: `${edge.id}-label-bg`,
      shape: "rectangle",
      ...route.label,
      strokeColor: "transparent",
      backgroundColor: theme.edge.labelBackground,
      strokeStyle: "solid",
      strokeWidth: 1,
      roughness: theme.roughness,
      groupId,
    });
    out.push({
      kind: "text",
      id: `${edge.id}-label`,
      text,
      // Center anchor (see renderNode) — keeps the text inside its backing rect.
      x: route.label.x + route.label.width / 2,
      y: route.label.y + 2,
      fontSize: theme.text.edgeLabel.size,
      fontFamily: theme.fontFamily,
      color: theme.text.edgeLabel.color,
      textAlign: "center",
      groupId,
    });
  }
}

/**
 * Converts a laid-out DiagramSpec into a framework-agnostic render plan:
 * shape/text/arrow/frame skeletons plus pre-formed raw icon element JSON.
 * Deliberately has zero dependency on `@excalidraw/excalidraw` -- that package
 * can only be imported in a browser context (see apps/web's
 * excalidraw-utils.ts, which does the final skeleton -> element conversion),
 * not here where this runs server-side.
 */
export function renderToExcalidraw(
  positioned: PositionedSpec,
  icons: HarnessIconRegistry,
  theme: Theme = classicTheme,
): RenderResult {
  const skeletons: RenderSkeleton[] = [];
  const rawElements: Record<string, unknown>[] = [];

  for (const zone of positioned.zones ?? []) {
    const box = positioned.zoneBoxes[zone.id];
    if (!box) continue;
    renderContainer(`zone-${zone.id}`, zone.label, undefined, zone.style, box, theme, skeletons);
  }

  // Sibling groups cycle through the theme's palette (when it has one) so
  // adjacent boxes get distinct colors. Boundary-style containers (dashed,
  // transparent) keep their semantic look and don't consume a palette slot.
  const palette = theme.containerPalette;
  let paletteIndex = 0;
  for (const group of positioned.groups ?? []) {
    const box = positioned.groupBoxes[group.id];
    if (!box) continue;
    const base = theme.containers[group.style ?? ""] ?? theme.defaultContainer;
    const paletteTokens =
      palette && palette.length > 0 && base.fill !== "transparent"
        ? palette[paletteIndex++ % palette.length]
        : undefined;
    renderContainer(
      `group-${group.id}`,
      group.label,
      group.sublabel,
      group.style,
      box,
      theme,
      skeletons,
      { strokeColor: group.strokeColor, backgroundColor: group.backgroundColor },
      paletteTokens,
    );
  }

  const contained = new Set(positioned.containedNodeIds);
  for (const node of positioned.nodes) {
    const box = positioned.positions[node.id];
    if (!box) continue;
    if (theme.nodeMode === "icon") {
      // Handdrawn: never a card. Icon nodes stand alone; icon-less nodes get
      // a mermaid-style box. Must mirror the branch in measure.ts nodeSize.
      if (node.icon) {
        renderSoloNode(node, box, icons, theme, skeletons, rawElements);
      } else {
        renderBoxNode(node, box, theme, skeletons);
      }
    } else if (contained.has(node.id)) {
      renderNode(node, box, icons, theme, skeletons, rawElements);
    } else {
      renderSoloNode(node, box, icons, theme, skeletons, rawElements);
    }
  }

  for (const edge of positioned.edges as (DiagramEdge & { id: string })[]) {
    const route = positioned.edgeRoutes[edge.id];
    if (!route) continue;
    renderEdge(edge, route, theme, skeletons);
  }

  // Wrap the whole diagram in a named frame: one-click select/move/export,
  // and the anchor for "replace this diagram" updates.
  skeletons.push({
    kind: "frame",
    id: `frame-${crypto.randomUUID()}`,
    name: positioned.title,
    children: [...skeletons.map((s) => s.id), ...rawElements.map((el) => el.id as string)],
  });

  return { skeletons, rawElements };
}
