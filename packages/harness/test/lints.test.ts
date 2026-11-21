/** Layout lints the fixer's judge reads: the empty-area scan and the hard-fault count. */
import { describe, expect, test } from "bun:test";
import { classicTheme, hardFaults, layoutLints, type Box } from "../src/index.js";
import { positioned } from "./helpers.js";

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

describe("EMPTY_AREA", () => {
  test("reports a square void even when a thin strip has more area", () => {
    // Canvas 1200 x 1000, every edge on the scan's 40px grid. Free: a strip
    // y 80..280 (1200 x 200 = 240,000, too thin to read as a hole) and a square
    // x 360..840, y 440..920 (480 x 480 = 230,400, over 15% of the canvas).
    const p = positioned({
      positions: {
        top: box(0, 0, 1200, 80),
        bottom: box(0, 920, 1200, 80),
        left: box(0, 280, 360, 640),
        right: box(840, 280, 360, 640),
        lid: box(360, 280, 480, 160),
      },
    });
    const empty = layoutLints(p, classicTheme).filter((l) => l.code === "EMPTY_AREA");
    expect(empty).toEqual([{ code: "EMPTY_AREA", subjects: ["360,440 480x480"] }]);
  });

  test("stays fast when one node sits far away", () => {
    const p = positioned({
      positions: {
        a: box(0, 0, 120, 60),
        b: box(200, 0, 120, 60),
        c: box(0, 200, 120, 60),
        d: box(200, 200, 120, 60),
        far: box(600_000, 600_000, 120, 60),
      },
    });
    const t = performance.now();
    layoutLints(p, classicTheme);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("hardFaults", () => {
  const nodes = { a: box(0, 0, 100, 60), b: box(400, 0, 100, 60), c: box(200, 200, 100, 60) };
  const withLabel = (label: Box) =>
    positioned({
      positions: nodes,
      edges: [{ id: "e", from: "a", to: "b", label: "x" }],
      edgeRoutes: {
        e: {
          points: [
            { x: 100, y: 30 },
            { x: 400, y: 30 },
          ],
          label,
        },
      },
    });

  test("counts an edge label printed over a box", () => {
    expect(hardFaults(withLabel(box(220, 20, 40, 20)), classicTheme)).toBe(0);
    expect(hardFaults(withLabel(box(210, 210, 40, 20)), classicTheme)).toBe(1);
  });

  test("counts a node sitting on its group's title", () => {
    const withA = (a: Box) =>
      positioned({
        positions: { a, b: box(600, 0, 100, 60) },
        groups: [{ id: "g", label: "Group", contains: ["a"] }],
        groupBoxes: { g: box(0, 0, 400, 300) },
        containedNodeIds: ["a"],
      });
    expect(hardFaults(withA(box(40, 120, 100, 60)), classicTheme)).toBe(0);
    expect(hardFaults(withA(box(12, 8, 100, 60)), classicTheme)).toBe(1);
  });
});
