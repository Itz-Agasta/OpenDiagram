/**
 * Invariants over random specs: what must hold for ANY diagram, whatever its
 * shape. A failure prints the seed and a shrunk counterexample; freeze it as a
 * fixture test once fixed.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  buildReport,
  classicTheme,
  hardFaults,
  layoutDiagram,
  renderToExcalidraw,
  type Box,
} from "../../src/index.js";
import { fcParams, specArb } from "../support/arb.js";
import { allFinite, textOf } from "../support/helpers.js";

const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

describe("layout invariants over random specs", () => {
  test("nothing is lost, nothing collides, every edge is routed", async () => {
    await fc.assert(
      fc.asyncProperty(specArb, async (spec) => {
        const p = await layoutDiagram(spec, classicTheme);

        for (const n of spec.nodes) {
          const b = p.positions[n.id];
          expect(b, `node ${n.id} placed`).toBeDefined();
          expect([b!.x, b!.y, b!.width, b!.height].every(Number.isFinite)).toBe(true);
        }
        for (const e of spec.edges) {
          const pts = p.edgeRoutes[e.id!]?.points ?? [];
          expect(pts.length, `edge ${e.id} routed`).toBeGreaterThanOrEqual(2);
          expect(pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
        }
        for (const g of spec.groups ?? []) {
          const frame = p.groupBoxes[g.id];
          expect(frame, `group ${g.id} framed`).toBeDefined();
          for (const id of g.contains) expect(inside(p.positions[id]!, frame!)).toBe(true);
        }

        const m = buildReport(p).metrics;
        expect(m.nodeOverlaps).toBe(0);
        expect(m.edgeThroughNode).toBe(0);
        expect(hardFaults(p, classicTheme)).toBe(0);

        const { skeletons } = renderToExcalidraw(p, {}, classicTheme);
        expect(allFinite(skeletons)).toBe(true);
        for (const n of spec.nodes)
          expect(textOf(skeletons, `${n.id}-label`), `label of ${n.id}`).toBe(
            n.label.replace(/\s+/g, ""),
          );
      }),
      fcParams(40),
    );
  }, 120_000);

  test("the same spec always lays out the same way", async () => {
    await fc.assert(
      fc.asyncProperty(specArb, async (spec) => {
        const [a, b] = [
          await layoutDiagram(spec, classicTheme),
          await layoutDiagram(spec, classicTheme),
        ];
        expect(b.positions).toEqual(a.positions);
        expect(b.edgeRoutes).toEqual(a.edgeRoutes);
        expect(b.groupBoxes).toEqual(a.groupBoxes);
        expect(b.zoneBoxes).toEqual(a.zoneBoxes);
      }),
      fcParams(15),
    );
  }, 120_000);
});
