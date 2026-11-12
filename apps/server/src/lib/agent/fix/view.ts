import {
  buildReport as harnessReport,
  hardFaults as harnessHardFaults,
  layoutLints as harnessLints,
  renderPreviewSvg,
  type PositionedSpec,
  type Theme,
} from "@OpenDiagram/harness";
import { Resvg } from "@resvg/resvg-js";

// One drawing is scored by the judge, the headline and the issue list each
// step; the crossing scan is O(segments^2), so compute each once per drawing.
const memo = <T>(fn: (p: PositionedSpec, theme: Theme) => T) => {
  const cache = new WeakMap<PositionedSpec, T>();
  return (p: PositionedSpec, theme: Theme): T => {
    if (!cache.has(p)) cache.set(p, fn(p, theme));
    return cache.get(p)!;
  };
};
const buildReport = memo((p) => harnessReport(p));
export const layoutLints = memo(harnessLints);
export const hardFaults = memo((p, theme) => harnessHardFaults(p, theme, layoutLints(p, theme)));

type Rect = { x: number; y: number; width: number; height: number };

// Wider than this the model downsamples anyway; 1600 keeps 14px labels legible.
const PICTURE_WIDTH = 1600;

/**
 * The drawing as the fixer sees it. Plain boxes and the exact arrow polylines,
 * ids printed on everything.
 *
 * FIXME(fix-picture-deploy): the server Dockerfile installs with
 * `--omit=optional`, which drops resvg's per-platform native binary, and the
 * slim image has no fonts. Ship a TTF and keep resvg's platform package before
 * this runs on Cloud Run.
 */
export function picture(p: PositionedSpec, theme: Theme): Uint8Array {
  const svg = renderPreviewSvg(p, theme);
  const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? PICTURE_WIDTH);
  const fitTo =
    width > PICTURE_WIDTH ? { mode: "width" as const, value: PICTURE_WIDTH } : undefined;
  return new Resvg(svg, {
    fitTo,
    font: { loadSystemFonts: true, sansSerifFamily: "Noto Sans", defaultFontFamily: "Noto Sans" },
  })
    .render()
    .asPng();
}

/**
 * The report score, NOT clamped at 0, minus container lints. On a tangled
 * diagram the clamped score sits at 0 whatever moves, so a judge reading it
 * reverts every honest improvement (use case diagram: stuck at 0, then -128 -> 24
 * once unclamped). Weights mirror PENALTY in the harness report.
 */
export function layoutCost(p: PositionedSpec, theme: Theme): number {
  const { score, metrics: m } = buildReport(p, theme);
  const containers = layoutLints(p, theme).filter((l) =>
    ["GROUP_OVERLAP", "NODE_IN_FOREIGN_GROUP"].includes(l.code),
  ).length;
  const penalty = Math.min(40, 8 * containers);
  if (score > 0) return score - penalty;
  const cost =
    25 * m.unrouted +
    20 * m.nodeOverlaps +
    12 * m.edgeThroughNode +
    8 * m.labelCollisions +
    6 * m.crossings +
    5 * m.duplicateLabels +
    3 * m.backEdges;
  return Math.min(0, 100 - cost) - penalty;
}

export function headline(p: PositionedSpec, theme: Theme): string {
  const { metrics } = buildReport(p, theme);
  const boxes = [...Object.values(p.positions), ...Object.values(p.groupBoxes)];
  const width = Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x));
  const height = Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y));
  return `score ${layoutCost(p, theme)} | hard faults ${hardFaults(p, theme)} | ${Math.round(width)}x${Math.round(height)} fit ${metrics.fit.toFixed(2)} | crossings ${metrics.crossings} bends ${metrics.bends}`;
}

export function issues(p: PositionedSpec, theme: Theme, lints: boolean): string[] {
  const all = [
    ...(lints ? layoutLints(p, theme).map((l) => `${l.code} ${l.subjects.join(" ")}`) : []),
    ...buildReport(p, theme).diagnostics.map((d) => `${d.code} ${d.subjects.join(" ")}`),
  ];
  return ["ISSUES", ...(all.length ? all.slice(0, 24) : ["none"])];
}

/** The whole drawing as text: every box with coordinates, every edge, every issue. */
export function textView(p: PositionedSpec, theme: Theme, lints: boolean): string {
  const parent = new Map<string, string>();
  for (const g of p.groups ?? []) for (const id of g.contains) parent.set(id, g.id);
  const box = (b: Rect) =>
    `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`;
  return [
    `"${p.title}" flow ${p.meta?.direction ?? "LR"} | ${headline(p, theme)}`,
    "NODES id | label | x,y WxH | group",
    ...p.nodes.map(
      (n) => `${n.id} | ${n.label} | ${box(p.positions[n.id]!)} | ${parent.get(n.id) ?? "-"}`,
    ),
    ...(Object.keys(p.groupBoxes).length
      ? [
          "GROUPS id | label | x,y WxH (auto-wrapped around members)",
          ...(p.groups ?? []).flatMap((g) =>
            p.groupBoxes[g.id] ? [`${g.id} | ${g.label} | ${box(p.groupBoxes[g.id]!)}`] : [],
          ),
        ]
      : []),
    "EDGES id | from>to | label (chip WxH: the gap between its boxes must fit it)",
    ...p.edges.map((e) => {
      const chip = p.edgeRoutes[e.id!]?.label;
      const size = chip ? ` (${Math.round(chip.width)}x${Math.round(chip.height)})` : "";
      return `${e.id} | ${e.from}>${e.to} | ${e.label ?? ""}${size}`;
    }),
    ...issues(p, theme, lints),
  ].join("\n");
}
