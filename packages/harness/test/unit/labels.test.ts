/** placeLabels: where the router puts each edge's label chip. */
import { describe, expect, test } from "bun:test";
import type { Box } from "../../src/index.js";
import { placeLabels } from "../../src/router/labels.js";

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("placeLabels", () => {
  test("a chip on a long run sits on its line", () => {
    const nodes = [box(0, 0, 170, 106), box(500, 0, 170, 106)];
    const routes = new Map([
      [
        "e",
        [
          { x: 170, y: 53 },
          { x: 500, y: 53 },
        ],
      ],
    ]);
    const chip = placeLabels(
      routes,
      new Map([["e", { width: 119, height: 22 }]]),
      nodes,
      [],
      [],
    ).get("e")!;
    expect(chip.y + chip.height / 2).toBe(53);
    expect(chip.x).toBeGreaterThanOrEqual(170);
    expect(chip.x + chip.width).toBeLessThanOrEqual(500);
  });

  test("a chip too wide for its run never lands on a node", () => {
    // Same-layer neighbours 48px apart: no legal spot on the 48px run. The
    // nearest free spot is straight above or below the boxes, 66px off the line.
    const nodes = [box(0, 0, 170, 106), box(218, 0, 170, 106)];
    const routes = new Map([
      [
        "e",
        [
          { x: 170, y: 53 },
          { x: 218, y: 53 },
        ],
      ],
    ]);
    const chip = placeLabels(
      routes,
      new Map([["e", { width: 119, height: 22 }]]),
      nodes,
      [],
      [],
    ).get("e")!;
    for (const n of nodes) expect(overlaps(chip, n)).toBe(false);
    const [cx, cy] = [chip.x + chip.width / 2, chip.y + chip.height / 2];
    expect(Math.hypot(cx - 194, cy - 53)).toBeLessThanOrEqual(80);
  });

  test("a chip with no room on its line does not hide another edge", () => {
    // Same 48px gap; other routes run where the nearest free spots would be,
    // straight above and below the boxes.
    const nodes = [box(0, 0, 170, 106), box(218, 0, 170, 106)];
    const routes = new Map([
      [
        "e",
        [
          { x: 170, y: 53 },
          { x: 218, y: 53 },
        ],
      ],
      [
        "above",
        [
          { x: -300, y: -13 },
          { x: 700, y: -13 },
        ],
      ],
      [
        "below",
        [
          { x: -300, y: 119 },
          { x: 700, y: 119 },
        ],
      ],
    ]);
    const chip = placeLabels(
      routes,
      new Map([["e", { width: 119, height: 22 }]]),
      nodes,
      [],
      [],
    ).get("e")!;
    for (const n of nodes) expect(overlaps(chip, n)).toBe(false);
    for (const y of [-13, 119]) expect(overlaps(chip, box(-300, y, 1000, 1))).toBe(false);
    // Next free spot clear of both lines is about 78px off; a far-away chip reads as nobody's.
    const [cx, cy] = [chip.x + chip.width / 2, chip.y + chip.height / 2];
    expect(Math.hypot(cx - 194, cy - 53)).toBeLessThanOrEqual(100);
  });
});
