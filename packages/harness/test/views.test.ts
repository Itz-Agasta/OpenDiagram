/** planViews: which diagrams a system model becomes. */
import { describe, expect, test } from "bun:test";
import { MAX_DETAIL_NODES, planViews, type SystemModel } from "../src/index.js";

type Component = SystemModel["components"][number];
const svc = (id: string, domain: string, category: Component["category"] = "service") => ({
  id,
  label: id,
  category,
  icon: "none",
  domain,
});

/** `domains` x (`perDomain` services + one database), a client and a gateway in front. */
function system(domains: number, perDomain: number): SystemModel {
  const names = Array.from({ length: domains }, (_, i) => `d${i}`);
  const components = [
    svc("web", "shared", "client"),
    svc("gw", "shared", "gateway"),
    ...names.flatMap((d) => [
      ...Array.from({ length: perDomain }, (_, i) => svc(`${d}_s${i}`, d)),
      svc(`${d}_db`, d, "database"),
    ]),
  ];
  const links = names.flatMap((d) => [
    { from: "gw", to: `${d}_s0` },
    ...Array.from({ length: perDomain }, (_, i) => ({
      from: `${d}_s${i}`,
      to: i + 1 < perDomain ? `${d}_s${i + 1}` : `${d}_db`,
    })),
  ]);
  return {
    title: "Shop",
    domains: names.map((id) => ({ id, label: id.toUpperCase() })),
    components,
    links,
    flows: [
      {
        title: "Checkout",
        type: "flow",
        steps: [
          { from: "web", to: "gw", label: "POST /order" },
          { from: "gw", to: "d0_s0", label: "route" },
          { from: "d0_s0", to: "d0_db", label: "write" },
        ],
      },
    ],
  };
}

/** Number of connected parts in the view's graph. */
function islands(view: { nodes: { id: string }[]; edges: { from: string; to: string }[] }) {
  const parent = new Map(view.nodes.map((n) => [n.id, n.id]));
  const root = (id: string): string => (parent.get(id) === id ? id : root(parent.get(id)!));
  for (const e of view.edges) parent.set(root(e.from), root(e.to));
  return new Set(view.nodes.map((n) => root(n.id))).size;
}

describe("planViews", () => {
  test("a small system is one detail view with every component", () => {
    const model = system(2, 3);
    expect(model.components.length).toBeLessThanOrEqual(MAX_DETAIL_NODES);
    const views = planViews(model);
    expect(views.map((v) => v.title)).toEqual(["Shop"]);
    expect(views[0]!.nodes.map((n) => n.id).sort()).toEqual(
      model.components.map((c) => c.id).sort(),
    );
  });

  test("a large system is an overview plus one view per flow", () => {
    const views = planViews(system(4, 4));
    expect(views.map((v) => v.title)).toEqual(["Shop - overview", "Checkout"]);
    expect(views[0]!.nodes.length).toBeLessThanOrEqual(MAX_DETAIL_NODES);
    expect(views[1]!.nodes.map((n) => n.id)).toEqual(["web", "gw", "d0_s0", "d0_db"]);
  });

  test("the overview edge budget never splits the graph", () => {
    // A heavy clique: pruning by weight alone spends the budget there and strands the rest.
    const model = system(4, 4);
    const clique = ["x1", "x2", "x3", "x4"];
    model.components.push(...clique.map((id) => svc(id, "shared")));
    model.links!.push({ from: "gw", to: "x1" });
    for (const [i, a] of clique.entries())
      for (const b of clique.slice(i + 1))
        for (let n = 0; n < 3; n++) model.links!.push({ from: a, to: b });
    const [overview] = planViews(model);
    expect(overview!.edges.length).toBeLessThanOrEqual(overview!.nodes.length);
    expect(islands(overview!)).toBe(1);
  });

  test.each([
    ["small", 2, 3],
    ["large", 4, 4],
  ])(
    "a %s system draws a sequence flow as its own diagram, replies dashed after the call",
    (_, domains, perDomain) => {
      const model = system(domains, perDomain);
      model.flows.push({
        title: "Login",
        type: "sequence",
        steps: [{ from: "web", to: "gw", label: "POST /login", reply: "token" }],
      });
      const login = planViews(model).find((v) => v.title === "Login")!;
      expect(login.type).toBe("sequence");
      expect(login.edges.map((e) => [e.from, e.to, e.style])).toEqual([
        ["web", "gw", undefined],
        ["gw", "web", "dashed"],
      ]);
    },
  );

  test("group ids never collide with component ids", () => {
    const model = system(2, 3);
    model.components.push(svc("domain_d0", "shared"));
    const [detail] = planViews(model);
    const nodeIds = new Set(detail!.nodes.map((n) => n.id));
    for (const g of detail!.groups ?? []) expect(nodeIds.has(g.id)).toBe(false);
  });
});
