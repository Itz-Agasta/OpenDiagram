import type { Box, PositionedSpec } from "./geometry.js";
import { edgeLabelText, labelWrapWidth, wrapLabel } from "./measure.js";
import type { Theme } from "./theme/index.js";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DASH: Record<string, string> = {
  async: "8 6",
  replication: "3 5",
  dashed: "8 6",
  dotted: "3 5",
};
const COLOR: Record<string, string> = { error: "#d33", success: "#2a2" };

/**
 * Plain SVG of a laid-out spec for a model to look at: the exact boxes, frames,
 * polylines and label chips the Excalidraw render uses, minus the sketch style.
 * Every node, edge and group carries its spec id in small grey text, so the
 * picture maps one to one onto the text view the fixer edits by id.
 * Not the product render (no icon art, no roughness), but node text wraps and
 * icon nodes draw as icon plus caption exactly where the renderer puts them:
 * one-line labels and full boxes read as "text overflows" and "arrow pierces
 * the node" to a model, and triage asked for fixes on clean drawings.
 */
export function renderPreviewSvg(p: PositionedSpec, theme: Theme): string {
  const boxes: Box[] = [
    ...Object.values(p.positions),
    ...Object.values(p.groupBoxes),
    ...Object.values(p.zoneBoxes),
    ...Object.values(p.edgeRoutes).flatMap((r) => (r.label ? [r.label] : [])),
  ];
  for (const r of Object.values(p.edgeRoutes))
    for (const q of r.points) boxes.push({ x: q.x, y: q.y, width: 0, height: 0 });
  const pad = 30;
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const w = Math.max(...boxes.map((b) => b.x + b.width)) - x0 + pad;
  const h = Math.max(...boxes.map((b) => b.y + b.height)) - y0 + pad;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="${x0} ${y0} ${w} ${h}" font-family="sans-serif">`,
    `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#334"/></marker></defs>`,
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>`,
  ];
  const containers = [
    ...[...(p.zones ?? [])].map((c) => [c, p.zoneBoxes[c.id]] as const),
    ...[...(p.groups ?? [])].map((c) => [c, p.groupBoxes[c.id]] as const),
  ];
  for (const [c, b] of containers) {
    if (!b) continue;
    out.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#f4f6fb" stroke="#7a86a8" stroke-dasharray="6 4"/>`,
      `<text x="${b.x + 10}" y="${b.y + 20}" font-size="15" fill="#3a4670">${esc(c.label)} <tspan fill="#999" font-size="11">[${esc(c.id)}]</tspan></text>`,
    );
  }
  const contained = new Set(p.containedNodeIds);
  const lines = (x: number, y: number, rows: string[], size: number, fill = "#222") =>
    rows
      .map(
        (row, i) =>
          `<text x="${x}" y="${y + i * size * 1.25}" font-size="${size}" text-anchor="middle" fill="${fill}">${esc(row)}</text>`,
      )
      .join("");
  for (const n of p.nodes) {
    const b = p.positions[n.id];
    if (!b) continue;
    const cx = b.x + b.width / 2;
    // Mirrors the solo branch in renderer.ts and route.ts.
    const solo =
      !n.columns?.length && (theme.nodeMode === "icon" ? Boolean(n.icon) : !contained.has(n.id));
    if (solo) {
      const icon = theme.solo.iconSize;
      const wrap = labelWrapWidth(icon);
      const label = wrapLabel(n.label, 15, undefined, wrap);
      const sub = n.sublabel ? wrapLabel(n.sublabel, 12, undefined, wrap) : [];
      const top = b.y + icon + theme.solo.gapIconLabel + 14;
      out.push(
        `<rect x="${cx - icon / 2}" y="${b.y}" width="${icon}" height="${icon}" rx="10" fill="#e8ecf8" stroke="#556"/>`,
        `<text x="${cx}" y="${b.y + icon / 2 + 5}" font-size="11" text-anchor="middle" fill="#889">icon</text>`,
        lines(cx, top, label, 15),
        lines(cx, top + label.length * 19 + 2, sub, 12, "#667"),
      );
    } else {
      const label = wrapLabel(n.label, 14, undefined, b.width - 16);
      const sub = n.sublabel ? wrapLabel(n.sublabel, 11, undefined, b.width - 16) : [];
      const h = label.length * 17.5 + sub.length * 14;
      const top = b.y + (b.height - h) / 2 + 13;
      out.push(
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="8" fill="#fff" stroke="#222" stroke-width="1.5"/>`,
        lines(cx, top, label, 14),
        lines(cx, top + label.length * 17.5, sub, 11, "#667"),
      );
    }
    out.push(`<text x="${b.x + 2}" y="${b.y - 3}" font-size="10" fill="#999">${esc(n.id)}</text>`);
  }
  for (const e of p.edges) {
    const r = p.edgeRoutes[e.id!];
    if (!r || r.points.length < 2) continue;
    const kind = e.style ?? e.kind ?? "";
    const dash = DASH[kind] ? ` stroke-dasharray="${DASH[kind]}"` : "";
    const start = e.direction === "bi" ? ` marker-start="url(#a)"` : "";
    out.push(
      `<polyline points="${r.points.map((q) => `${q.x},${q.y}`).join(" ")}" fill="none" stroke="${COLOR[kind] ?? "#334"}" stroke-width="1.6"${dash}${start} marker-end="url(#a)"/>`,
    );
    const text = edgeLabelText(e);
    const l = r.label;
    if (l)
      out.push(
        `<rect x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" fill="#fff" fill-opacity="0.85"/>`,
        `<text x="${l.x + l.width / 2}" y="${l.y + l.height / 2 + 4}" font-size="12" text-anchor="middle" fill="#334">${esc(text ?? "")} <tspan fill="#c60" font-size="10">${esc(e.id!)}</tspan></text>`,
      );
    else {
      const m = r.points[Math.floor(r.points.length / 2)]!;
      out.push(
        `<text x="${m.x + 3}" y="${m.y - 3}" font-size="10" fill="#c60">${esc(e.id!)}</text>`,
      );
    }
  }
  out.push("</svg>");
  return out.join("\n");
}
