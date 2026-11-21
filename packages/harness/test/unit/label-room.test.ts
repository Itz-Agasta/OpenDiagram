/** labelRoom: ELK leaves no label room between same-layer neighbours; layout makes it. */
import { describe, expect, test } from "bun:test";
import { classicTheme, layoutDiagram, type Box, type DiagramSpec } from "../../src/index.js";
import { edgeLabelSize } from "../../src/layout/elk-common.js";
import { labelRoom } from "../../src/layout/label-room.js";
import { sanitize } from "../../src/layout/sanitize.js";

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("label room between same-layer neighbours", () => {
  // Replication does not place nodes, so primary and replica share a layer.
  const spec: DiagramSpec = {
    type: "system-design",
    title: "Replica",
    nodes: [
      { id: "app", label: "Order Service", category: "service" },
      { id: "pri", label: "Orders DB", sublabel: "Primary", category: "database" },
      { id: "rep", label: "Orders DB", sublabel: "Read Replica", category: "database" },
    ],
    edges: [
      { id: "w", from: "app", to: "pri", label: "Write" },
      { id: "r", from: "app", to: "rep", label: "Read" },
      { id: "x", from: "pri", to: "rep", label: "Async Replication", kind: "replication" },
    ],
    meta: { direction: "TB" },
  };

  test("a replication label sits on its own line between primary and replica", async () => {
    const p = await layoutDiagram(spec, classicTheme);
    const { points, label } = p.edgeRoutes.x!;
    const chip = label!;
    // One horizontal run between the two boxes, and the chip centred on it.
    expect(points.every((q) => q.y === points[0]!.y)).toBe(true);
    expect(chip.y + chip.height / 2).toBe(points[0]!.y);
    expect(overlaps(chip, p.positions.pri!)).toBe(false);
    expect(overlaps(chip, p.positions.rep!)).toBe(false);
  });
});

describe("labelRoom", () => {
  const node = (id: string) => ({ id, label: id, category: "service" as const });
  const geo = (positions: Record<string, Box>) => ({ positions, groupBoxes: {}, zoneBoxes: {} });
  const tb = (edges: DiagramSpec["edges"]): DiagramSpec => ({
    type: "system-design",
    title: "t",
    nodes: [node("a"), node("b")],
    edges,
    meta: { direction: "TB" },
  });

  test("a labelled self-loop asks for no room: wider siblings cannot help it", () => {
    const spec = tb([{ id: "s", from: "a", to: "a", label: "Retry Loop" }]);
    const at = geo({
      a: { x: 0, y: 0, width: 100, height: 60 },
      b: { x: 148, y: 0, width: 100, height: 60 },
    });
    expect(labelRoom(spec, sanitize(spec), at, classicTheme).size).toBe(0);
  });

  test("the gap it asks for is at least the room the chip needs", () => {
    // Already wider than ELK's 48px sibling gap, still short of the chip.
    const spec = tb([{ id: "e", from: "a", to: "b", label: "Async Replication Stream" }]);
    const at = geo({
      a: { x: 0, y: 0, width: 100, height: 60 },
      b: { x: 200, y: 0, width: 100, height: 60 },
    });
    const chip = edgeLabelSize(sanitize(spec).edges[0]!, classicTheme)!;
    expect(chip.width + 32).toBeGreaterThan(100);
    expect(labelRoom(spec, sanitize(spec), at, classicTheme).get("root")).toBeGreaterThanOrEqual(
      chip.width + 32,
    );
  });
});
