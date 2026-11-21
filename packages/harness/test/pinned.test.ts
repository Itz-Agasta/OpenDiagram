/** layoutPinned: re-solving a drawing around positions the layout fixer chose. */
import { describe, expect, test } from "bun:test";
import { classicTheme, layoutDiagram, layoutPinned, type DiagramSpec } from "../src/index.js";
import { containerTitleBox } from "../src/measure.js";
import { FACES } from "../src/router/types.js";
import { centreX, onFace } from "./helpers.js";

describe("layoutPinned", () => {
  test("a group frame stays centred on its members when the title is wider", () => {
    const group = {
      id: "g",
      label: "A Very Long Group Title Wider Than Its Members",
      contains: ["a"],
    };
    const spec: DiagramSpec = {
      type: "system-design",
      title: "Centring",
      nodes: [
        { id: "a", label: "Auth", category: "service" },
        { id: "b", label: "Client", category: "client" },
      ],
      edges: [{ from: "b", to: "a" }],
      groups: [group],
    };
    const p = layoutPinned(spec, { a: { x: 500, y: 300 }, b: { x: 0, y: 0 } }, {}, classicTheme);
    const title = containerTitleBox(group, classicTheme).width;
    const frame = p.groupBoxes.g!;
    // Precondition: the title, not the members, sets the width (+32 margin).
    expect(frame.width).toBe(title + 32);
    expect(Math.abs(centreX(frame) - centreX(p.positions.a!))).toBeLessThan(0.5);

    // Two members still narrower than the title: centred on their midpoint.
    const two: DiagramSpec = {
      ...spec,
      nodes: [...spec.nodes, { id: "c", label: "Users", category: "service" }],
      groups: [{ ...group, contains: ["a", "c"] }],
    };
    const q = layoutPinned(
      two,
      { a: { x: 500, y: 300 }, b: { x: 0, y: 0 }, c: { x: 690, y: 300 } },
      {},
      classicTheme,
    );
    const [a, c] = [q.positions.a!, q.positions.c!];
    const left = Math.min(a.x, c.x);
    const right = Math.max(a.x + a.width, c.x + c.width);
    expect(q.groupBoxes.g!.width).toBe(title + 32);
    expect(Math.abs(centreX(q.groupBoxes.g!) - (left + right) / 2)).toBeLessThan(0.5);
  });

  test("a node missing from at keeps its fallback spot and every edge is re-routed", async () => {
    const spec: DiagramSpec = {
      type: "system-design",
      title: "Fallback",
      nodes: [
        { id: "a", label: "Web", category: "client" },
        { id: "b", label: "API", category: "service" },
        { id: "c", label: "DB", category: "database" },
      ],
      edges: [
        { id: "ab", from: "a", to: "b" },
        { id: "bc", from: "b", to: "c" },
      ],
    };
    const drawn = await layoutDiagram(spec, classicTheme);
    const was = drawn.positions;
    const at = { a: { x: was.a!.x, y: was.a!.y + 400 } };
    const p = layoutPinned(spec, at, was, classicTheme);

    expect(p.positions.b).toMatchObject({ x: Math.round(was.b!.x), y: Math.round(was.b!.y) });
    expect(p.positions.c).toMatchObject({ x: Math.round(was.c!.x), y: Math.round(was.c!.y) });
    expect(p.positions.a!.y).toBe(Math.round(was.a!.y + 400));
    expect(Object.keys(p.edgeRoutes).sort()).toEqual(["ab", "bc"]);
    // The route follows the moved box: it starts on a's new border and ends on b's.
    const ab = p.edgeRoutes.ab!.points;
    expect(FACES.some((f) => onFace(ab[0]!, p.positions.a!, f))).toBe(true);
    expect(FACES.some((f) => onFace(ab.at(-1)!, p.positions.b!, f))).toBe(true);
  });

  test("a pinned side is the face the route leaves and enters by", () => {
    const spec: DiagramSpec = {
      type: "system-design",
      title: "Sides",
      nodes: [
        { id: "a", label: "Web", category: "client" },
        { id: "b", label: "API", category: "service" },
      ],
      edges: [{ id: "e", from: "a", to: "b" }],
    };
    // Side by side, this pair routes right face to left face unless pinned.
    const at = { a: { x: 0, y: 0 }, b: { x: 600, y: 0 } };
    const p = layoutPinned(spec, at, {}, classicTheme, { e: { from: "bottom", to: "bottom" } });
    const pts = p.edgeRoutes.e!.points;
    expect(onFace(pts[0]!, p.positions.a!, "bottom")).toBe(true);
    expect(onFace(pts.at(-1)!, p.positions.b!, "bottom")).toBe(true);
  });
});
