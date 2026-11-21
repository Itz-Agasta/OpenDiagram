/** alignColumns: the row/column snap that runs after ELK places nodes. */
import { describe, expect, test } from "bun:test";
import { classicTheme, layoutDiagram, layoutLints, type DiagramSpec } from "../../src/index.js";
import { containerTitleBox } from "../../src/measure.js";

const node = (id: string, label = "Cache", sublabel?: string) => ({
  id,
  label,
  sublabel,
  category: "service" as const,
});

describe("alignColumns", () => {
  // Two groups laid out apart (two-phase fold), so their rows do not line up
  // and the snap is big. Found by the random-spec invariants.
  const spec: DiagramSpec = {
    type: "system-design",
    title: "Snap",
    nodes: [
      node("a"),
      node("b"),
      node("c"),
      node("t", "Order Processing Service With A Long Name", "Handles checkout and payments"),
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
    ],
    groups: [
      { id: "g0", label: "Core", contains: ["a", "b"] },
      { id: "g1", label: "Orders", contains: ["t"] },
    ],
    meta: { direction: "TB" },
  };

  // auto is what users get; two-phase is the path that snapped a node onto a title.
  test.each(["auto", "two-phase"] as const)(
    "a snap never moves a node onto its group's title band (%s)",
    async (strategy) => {
      const p = await layoutDiagram(spec, classicTheme, { strategy });
      for (const g of spec.groups!) {
        const frame = p.groupBoxes[g.id]!;
        // The band ELK reserves above members: title plus a 30px gap (containerOptions).
        const membersTop = frame.y + 30 + containerTitleBox(g, classicTheme).height;
        for (const id of g.contains) expect(p.positions[id]!.y).toBeGreaterThanOrEqual(membersTop);
      }
      expect(layoutLints(p, classicTheme).filter((l) => l.code === "NODE_ON_TITLE")).toEqual([]);
    },
  );
});
