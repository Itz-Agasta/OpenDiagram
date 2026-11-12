import type { Box } from "../geometry.js";
import { containerTitleBox, nodeSize } from "../measure.js";
import type { DiagramSpec } from "../schema.js";
import type { Theme } from "../theme/index.js";
import type { LayoutGeometry } from "./macro.js";
import type { Sanitized } from "./sanitize.js";

// Room between cells for an orthogonal route plus its label chip.
const GAP_X = 120;
const GAP_Y = 90;
const PAD = 24;

/**
 * Placement dictated by the spec (`meta.arrange`) instead of ELK: a grid of
 * rows, or a hub with the rest on a ring. The agent names cells, never pixels;
 * sizes still come from `nodeSize`. Returns null when the spec asks for
 * neither, or names no node that exists.
 */
export function arrangedLayout(
  spec: DiagramSpec,
  s: Sanitized,
  theme: Theme,
): LayoutGeometry | null {
  const arrange = spec.meta?.arrange;
  if (!arrange) return null;
  const sizes = new Map(
    spec.nodes.map((n) => [n.id, nodeSize(n, theme, s.nodeParent.has(n.id))] as const),
  );
  // Containers add a title band and padding around their members.
  const contained = s.groups.length + s.zones.length > 0;
  const gapX = GAP_X + (contained ? 2 * PAD : 0);
  const gapY = GAP_Y + (contained ? 2 * PAD + 30 : 0);
  const positions: Record<string, Box> = {};

  if (arrange.center && sizes.has(arrange.center)) {
    const ring = spec.nodes.filter((n) => n.id !== arrange.center).map((n) => n.id);
    const maxW = Math.max(...[...sizes.values()].map((b) => b.width));
    const maxH = Math.max(...[...sizes.values()].map((b) => b.height));
    // Circumference must fit every ring node side by side, with the gap.
    const rx = Math.max(maxW + gapX, (ring.length * (maxW + GAP_X * 0.6)) / (2 * Math.PI));
    const ry = Math.max(maxH + gapY, rx * 0.62);
    const hub = sizes.get(arrange.center)!;
    positions[arrange.center] = { x: -hub.width / 2, y: -hub.height / 2, ...hub };
    ring.forEach((id, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / ring.length;
      const size = sizes.get(id)!;
      positions[id] = {
        x: Math.cos(angle) * rx - size.width / 2,
        y: Math.sin(angle) * ry - size.height / 2,
        ...size,
      };
    });
  } else if (arrange.rows?.length) {
    const seen = new Set<string>();
    const rows = arrange.rows.map((row) =>
      row.map((id) => {
        if (!sizes.has(id) || seen.has(id)) return "";
        seen.add(id);
        return id;
      }),
    );
    if (seen.size === 0) return null;
    const cols = Math.max(...rows.map((r) => r.length));
    // Nodes the rows forgot go underneath rather than vanish.
    const rest = spec.nodes.map((n) => n.id).filter((id) => !seen.has(id));
    for (let i = 0; i < rest.length; i += cols) rows.push(rest.slice(i, i + cols));

    const colW = Array.from({ length: cols }, (_, c) =>
      Math.max(0, ...rows.map((r) => sizes.get(r[c] ?? "")?.width ?? 0)),
    );
    const rowH = rows.map((r) => Math.max(0, ...r.map((id) => sizes.get(id)?.height ?? 0)));
    let y = 0;
    rows.forEach((row, r) => {
      let x = 0;
      row.forEach((id, c) => {
        const size = sizes.get(id);
        if (size) {
          positions[id] = {
            x: x + (colW[c]! - size.width) / 2,
            y: y + (rowH[r]! - size.height) / 2,
            ...size,
          };
        }
        x += colW[c]! + gapX;
      });
      y += rowH[r]! + gapY;
    });
  } else {
    return null;
  }

  return { positions, ...containerBoxes(spec, s, positions, theme, true) };
}

/**
 * Group and zone boxes wrapped around already-placed members. `strict` drops a
 * group's frame when it would box in a non-member or cut across another group
 * (members not neighbours in a dictated grid); otherwise every frame is kept.
 */
export function containerBoxes(
  spec: DiagramSpec,
  s: Sanitized,
  positions: Record<string, Box>,
  theme: Theme,
  strict: boolean,
): Pick<LayoutGeometry, "groupBoxes" | "zoneBoxes"> {
  const labelled = new Map([...(spec.groups ?? []), ...(spec.zones ?? [])].map((c) => [c.id, c]));
  const wrap = (id: string, members: Box[]): Box | undefined => {
    if (members.length === 0) return undefined;
    const title = containerTitleBox(labelled.get(id) ?? { label: "" }, theme);
    const left = Math.min(...members.map((b) => b.x)) - PAD;
    const top = Math.min(...members.map((b) => b.y)) - 30 - title.height;
    const right = Math.max(...members.map((b) => b.x + b.width)) + PAD;
    const bottom = Math.max(...members.map((b) => b.y + b.height)) + PAD;
    // A title wider than the members widens the frame on both sides: anchored
    // left, every re-wrap after a fixer move showed its boxes off centre.
    const width = Math.max(right - left, title.width + 32);
    return { x: (left + right - width) / 2, y: top, width, height: bottom - top };
  };
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const groupBoxes: Record<string, Box> = {};
  for (const g of s.groups) {
    const box = wrap(
      g.id,
      g.contains.flatMap((id) => positions[id] ?? []),
    );
    if (!box) continue;
    const strangers = Object.entries(positions).some(
      ([id, b]) => !g.contains.includes(id) && overlaps(box, b),
    );
    if (strict && (strangers || Object.values(groupBoxes).some((o) => overlaps(box, o)))) {
      s.warnings.push(`group "${g.id}" is not contiguous in the arrangement - drawn without a box`);
      continue;
    }
    groupBoxes[g.id] = box;
  }
  const zoneBoxes: Record<string, Box> = {};
  for (const z of s.zones) {
    const box = wrap(
      z.id,
      z.contains.flatMap((id) => groupBoxes[id] ?? positions[id] ?? []),
    );
    if (box) zoneBoxes[z.id] = box;
  }
  return { groupBoxes, zoneBoxes };
}
