/** ERD: entity table sizing, crow-foot arrowheads, column rows. */
import { describe, expect, test } from "bun:test";
import { classicTheme, layoutDiagram, renderToExcalidraw, type DiagramSpec } from "../src/index.js";
import { allFinite } from "./helpers.js";

describe("erd", () => {
  const erd: DiagramSpec = {
    type: "erd",
    title: "E-commerce Schema",
    nodes: [
      {
        id: "users",
        label: "users",
        category: "database",
        columns: [
          { name: "id", type: "uuid", key: "pk" },
          { name: "email", type: "varchar(255)" },
          { name: "created_at", type: "timestamptz" },
        ],
      },
      {
        id: "orders",
        label: "orders",
        category: "database",
        columns: [
          { name: "id", type: "uuid", key: "pk" },
          { name: "user_id", type: "uuid", key: "fk" },
          { name: "total_cents", type: "bigint" },
        ],
      },
      {
        id: "order_items",
        label: "order_items",
        category: "database",
        columns: [
          { name: "id", type: "uuid", key: "pk" },
          { name: "order_id", type: "uuid", key: "fk" },
          { name: "qty", type: "int" },
        ],
      },
    ],
    edges: [
      { from: "users", to: "orders", cardinality: "one-to-many", label: "places" },
      { from: "orders", to: "order_items", cardinality: "one-to-many" },
    ],
  };

  test("lays out top-down with crow-foot arrowheads and column rows", async () => {
    const positioned = await layoutDiagram(erd, classicTheme);
    const rendered = renderToExcalidraw(positioned, {}, classicTheme);
    expect(positioned.warnings).toEqual([]);
    expect(allFinite(rendered.skeletons)).toBe(true);

    const arrows = rendered.skeletons.filter((s) => s.kind === "arrow");
    for (const a of arrows) {
      expect(a.kind === "arrow" && a.startArrowhead).toBe("crowfoot_one");
      expect(a.kind === "arrow" && a.endArrowhead).toBe("crowfoot_many");
    }

    const ys = ["users", "orders", "order_items"].map((id) => positioned.positions[id]!.y);
    expect(ys[0]!).toBeLessThan(ys[1]!);
    expect(ys[1]!).toBeLessThan(ys[2]!);

    const colTexts = rendered.skeletons.filter((s) => s.kind === "text" && s.id.includes("-col-"));
    expect(colTexts.length).toBe(9 * 2); // 9 columns × (name + type)
  });
});
