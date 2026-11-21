/** meta.arrange: placement the spec dictates instead of ELK. */
import { describe, expect, test } from "bun:test";
import { classicTheme, layoutDiagram, type DiagramSpec } from "../../src/index.js";
import { centreX } from "../support/helpers.js";

const node = (id: string) => ({ id, label: `Service ${id}`, category: "service" as const });

describe("meta.arrange", () => {
  test("rows place nodes in that grid order and forgotten nodes go underneath", async () => {
    const spec: DiagramSpec = {
      type: "system-design",
      title: "Grid",
      nodes: ["a", "b", "c", "d"].map(node),
      edges: [],
      meta: {
        arrange: {
          rows: [
            ["c", "a"],
            ["b", ""],
          ],
        },
      },
    };
    const P = (await layoutDiagram(spec, classicTheme)).positions;
    expect(P.c!.x + P.c!.width).toBeLessThanOrEqual(P.a!.x);
    expect(P.c!.y + P.c!.height / 2).toBeCloseTo(P.a!.y + P.a!.height / 2, 0);
    const row1Bottom = Math.max(P.a!.y + P.a!.height, P.c!.y + P.c!.height);
    expect(P.b!.y).toBeGreaterThanOrEqual(row1Bottom);
    expect(centreX(P.b!)).toBeCloseTo(centreX(P.c!), 0);
    // d is in no row: it must land below the grid, not vanish.
    expect(P.d).toBeDefined();
    expect(P.d!.y).toBeGreaterThanOrEqual(P.b!.y + P.b!.height);
  });

  test("a zone keeps the nodes of a group whose frame strict arrangement dropped", async () => {
    const spec: DiagramSpec = {
      type: "system-design",
      title: "Zone",
      nodes: ["a", "b", "c"].map(node),
      edges: [],
      // b sits between a and c, so g's frame would box in a stranger.
      groups: [{ id: "g", label: "Group", contains: ["a", "c"] }],
      zones: [{ id: "z", label: "Region", contains: ["g", "b"] }],
      meta: { arrange: { rows: [["a", "b", "c"]] } },
    };
    const p = await layoutDiagram(spec, classicTheme);
    expect(p.groupBoxes.g).toBeUndefined();
    expect(p.warnings.some((w) => w.includes('group "g"'))).toBe(true);
    const z = p.zoneBoxes.z!;
    expect(z).toBeDefined();
    for (const id of ["a", "b", "c"]) {
      const n = p.positions[id]!;
      expect(n.x).toBeGreaterThanOrEqual(z.x);
      expect(n.x + n.width).toBeLessThanOrEqual(z.x + z.width);
    }
  });
});
