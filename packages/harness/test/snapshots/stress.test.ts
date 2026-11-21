/**
 * The stress corpus: hard checks on every fixture, then a snapshot of its
 * geometry so any change to placement or routing is a reviewed diff. Update
 * with `just snapshots` only after looking at the new layout.
 */
import { describe, expect, test } from "bun:test";
import {
  classicTheme,
  edgeLabelText,
  hardFaults,
  layoutDiagram,
  renderSequenceDiagram,
  renderToExcalidraw,
  type PositionedSpec,
  type RenderSkeleton,
} from "../../src/index.js";
import { sequence, stress } from "../fixtures/stress.js";
import { textOf } from "../support/helpers.js";

// 4px grid: sub-pixel float noise from ELK must not churn the snapshot.
const r4 = (v: number) => Math.round(v / 4) * 4;
const box = (b: { x: number; y: number; width: number; height: number }) =>
  `${r4(b.x)},${r4(b.y)} ${r4(b.width)}x${r4(b.height)}`;

function geometry(p: PositionedSpec): string {
  const lines = [
    ...Object.entries(p.positions).map(([id, b]) => `node ${id} ${box(b)}`),
    ...Object.entries(p.groupBoxes).map(([id, b]) => `group ${id} ${box(b)}`),
    ...Object.entries(p.zoneBoxes).map(([id, b]) => `zone ${id} ${box(b)}`),
    ...Object.entries(p.edgeRoutes).map(
      ([id, r]) =>
        `edge ${id} ${r.points.map((q) => `${r4(q.x)},${r4(q.y)}`).join(" ")}${r.label ? ` [${box(r.label)}]` : ""}`,
    ),
  ];
  return lines.sort().join("\n");
}

const texts = (skeletons: RenderSkeleton[]) =>
  skeletons
    .flatMap((s) => (s.kind === "text" ? [s.text] : []))
    .join(" ")
    .replace(/\s+/g, "");

describe("stress corpus", () => {
  for (const [name, spec] of Object.entries(stress)) {
    test(name, async () => {
      const p = await layoutDiagram(spec, classicTheme);
      for (const n of spec.nodes) expect(p.positions[n.id], `node ${n.id}`).toBeDefined();
      for (const e of p.edges)
        expect(p.edgeRoutes[e.id!]?.points.length ?? 0, `edge ${e.id}`).toBeGreaterThanOrEqual(2);
      expect(hardFaults(p, classicTheme)).toBe(0);
      const { skeletons } = renderToExcalidraw(p, {}, classicTheme);
      for (const n of spec.nodes)
        expect(textOf(skeletons, `${n.id}-label`), `label of ${n.id}`).toBe(
          n.label.replace(/\s+/g, ""),
        );
      // Every label sanitize kept: it drops repeats along one fan corridor on purpose.
      for (const e of p.edges) {
        const label = edgeLabelText(e);
        if (label)
          expect(textOf(skeletons, `${e.id}-label`), `label of ${e.id}`).toBe(
            label.replace(/\s+/g, ""),
          );
      }
      expect(geometry(p)).toMatchSnapshot();
    });
  }

  test("sequence", () => {
    const { skeletons, warnings } = renderSequenceDiagram(sequence, classicTheme);
    expect(warnings).toEqual([]);
    const text = texts(skeletons);
    for (const m of sequence.edges) expect(text).toContain(m.label!.replace(/\s+/g, ""));
    // The frame's id is a fresh UUID per render (canvas-unique); it has no box.
    const shape = skeletons
      .map((s) =>
        s.kind === "frame"
          ? `frame ${s.name} ${s.children.length} children`
          : `${s.kind} ${s.id} ${r4(s.x)},${r4(s.y)}${"width" in s ? ` ${r4(s.width)}x${r4(s.height)}` : ""}`,
      )
      .sort()
      .join("\n");
    expect(shape).toMatchSnapshot();
  });
});
