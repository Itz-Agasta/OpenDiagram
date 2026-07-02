import type { PositionedSpec, Box } from "./layout.js";

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
      strokeWidth?: number;
      opacity?: number;
      groupId?: string;
    }
  | {
      kind: "text";
      text: string;
      x: number;
      y: number;
      fontSize?: number;
      textAlign?: "left" | "center" | "right";
      groupId?: string;
    }
  | {
      kind: "arrow";
      x: number;
      y: number;
      endX: number;
      endY: number;
      startId: string;
      endId: string;
      label?: string;
      startArrowhead: "none" | "arrow" | "circle" | "bar";
      endArrowhead: "none" | "arrow" | "circle" | "bar";
      strokeStyle?: "solid" | "dashed" | "dotted";
    };

export interface RenderResult {
  skeletons: RenderSkeleton[];
  rawElements: Record<string, unknown>[];
}

const ICON_PADDING = 0.8;

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
 * extraction, and wrapping the whole clone in `instanceGroupId` so it (plus
 * the node's label rendered alongside it) drags as one unit.
 */
function cloneIconInstance(
  elements: readonly Record<string, unknown>[],
  box: Box,
  instanceGroupId: string,
): Record<string, unknown>[] {
  // Icon packs bundle their own caption text (e.g. "Device") baked into the
  // library snapshot — dropped here since every node already gets its own
  // label/sublabel rendered separately, and keeping both produced duplicate
  // or mismatched captions on the canvas.
  const raw = (elements as unknown as RawExcalidrawElement[]).filter((el) => el.type !== "text");
  if (raw.length === 0) return [];

  const minX = Math.min(...raw.map((el) => el.x));
  const minY = Math.min(...raw.map((el) => el.y));
  const maxX = Math.max(...raw.map((el) => el.x + el.width));
  const maxY = Math.max(...raw.map((el) => el.y + el.height));
  const bboxWidth = maxX - minX || 1;
  const bboxHeight = maxY - minY || 1;

  const scale = Math.min(box.width / bboxWidth, box.height / bboxHeight) * ICON_PADDING;
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
    clone.boundElements = (el.boundElements ?? [])
      .filter((be) => idMap.has(be.id))
      .map((be) => ({
        ...be,
        id: idMap.get(be.id),
      }));
    clone.containerId =
      el.containerId && idMap.has(el.containerId) ? idMap.get(el.containerId) : null;
    clone.version = 1;
    clone.versionNonce = freshVolatileId();
    clone.seed = freshVolatileId();
    clone.updated = Date.now();
    clone.isDeleted = false;
    return clone;
  });
}

/**
 * Converts a laid-out DiagramSpec into a framework-agnostic render plan:
 * simple shape/text/arrow skeletons plus pre-formed raw icon element JSON.
 * Deliberately has zero dependency on `@excalidraw/excalidraw` — that
 * package can only be imported in a browser context (see apps/web's
 * excalidraw-utils.ts, which does the final skeleton -> real element
 * conversion), not here where this may run server-side.
 */
export function renderToExcalidraw(
  positioned: PositionedSpec,
  icons: HarnessIconRegistry,
): RenderResult {
  const skeletons: RenderSkeleton[] = [];
  const rawElements: Record<string, unknown>[] = [];

  for (const zone of positioned.zones ?? []) {
    const box = positioned.zoneBoxes[zone.id];
    if (!box) continue;
    const groupId = crypto.randomUUID();
    skeletons.push({
      kind: "container",
      id: `zone-${zone.id}`,
      shape: "rectangle",
      ...box,
      strokeColor: "#94a3b8",
      backgroundColor: "transparent",
      strokeStyle: "dotted",
      strokeWidth: 1,
      groupId,
    });
    skeletons.push({
      kind: "text",
      text: zone.label,
      x: box.x + 12,
      y: box.y + 8,
      fontSize: 14,
      textAlign: "left",
      groupId,
    });
  }

  for (const group of positioned.groups ?? []) {
    const box = positioned.groupBoxes[group.id];
    if (!box) continue;
    const groupId = crypto.randomUUID();
    skeletons.push({
      kind: "container",
      id: `group-${group.id}`,
      shape: "rectangle",
      ...box,
      strokeColor: group.strokeColor ?? "#374151",
      backgroundColor: group.backgroundColor ?? "transparent",
      strokeStyle: "dashed",
      strokeWidth: 1,
      groupId,
    });
    const label = group.sublabel ? `${group.label} — ${group.sublabel}` : group.label;
    skeletons.push({
      kind: "text",
      text: label,
      x: box.x + 12,
      y: box.y + 8,
      fontSize: 14,
      textAlign: "left",
      groupId,
    });
  }

  for (const node of positioned.nodes) {
    const box = positioned.positions[node.id];
    if (!box) continue;
    const icon = node.icon ? icons[node.icon] : undefined;
    const instanceGroupId = crypto.randomUUID();

    if (icon) {
      rawElements.push(...cloneIconInstance(icon.elements, box, instanceGroupId));
      skeletons.push({
        kind: "container",
        id: node.id,
        shape: "rectangle",
        ...box,
        opacity: 0,
        groupId: instanceGroupId,
      });
    } else {
      skeletons.push({
        kind: "container",
        id: node.id,
        shape:
          node.shape === "cylinder" || node.shape === "document"
            ? "rectangle"
            : (node.shape ?? "rectangle"),
        ...box,
        strokeColor: node.style?.strokeColor ?? "#1e293b",
        backgroundColor: node.style?.backgroundColor ?? "#f8fafc",
        strokeStyle: node.style?.strokeStyle ?? "solid",
        strokeWidth: node.style?.strokeWidth ?? 2,
        groupId: instanceGroupId,
      });
    }

    skeletons.push({
      kind: "text",
      text: node.label,
      x: box.x + box.width / 2,
      y: box.y + box.height + 8,
      fontSize: 13,
      textAlign: "center",
      groupId: instanceGroupId,
    });
    if (node.sublabel) {
      skeletons.push({
        kind: "text",
        text: node.sublabel,
        x: box.x + box.width / 2,
        y: box.y + box.height + 26,
        fontSize: 11,
        textAlign: "center",
        groupId: instanceGroupId,
      });
    }
  }

  for (const edge of positioned.edges) {
    const fromBox = positioned.positions[edge.from];
    const toBox = positioned.positions[edge.to];
    if (!fromBox || !toBox) continue;
    const label = [edge.label, edge.protocol].filter(Boolean).join(" · ") || undefined;
    skeletons.push({
      kind: "arrow",
      // Center-to-center line; id-based start/end binding (below) then snaps
      // the visible endpoints to the actual box edges once bound.
      x: fromBox.x + fromBox.width / 2,
      y: fromBox.y + fromBox.height / 2,
      endX: toBox.x + toBox.width / 2,
      endY: toBox.y + toBox.height / 2,
      startId: edge.from,
      endId: edge.to,
      label,
      startArrowhead: edge.startArrowhead ?? (edge.direction === "bi" ? "arrow" : "none"),
      endArrowhead: edge.endArrowhead ?? "arrow",
      strokeStyle: edge.style ?? "solid",
    });
  }

  return { skeletons, rawElements };
}
