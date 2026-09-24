/** ELK layout invariants and the two-phase fold. */
import { describe, expect, test } from "bun:test";
import {
  classicTheme,
  layoutDiagram,
  renderToExcalidraw,
  sketchTheme,
  type DiagramSpec,
} from "../src/index.js";
import { containerTitleBox } from "../src/measure.js";
import { allFinite } from "./helpers.js";

describe("elk layout invariants", () => {
  const spec: DiagramSpec = {
    type: "system-design",
    title: "Align Test",
    nodes: [
      { id: "gw", label: "API Gateway", category: "gateway" },
      { id: "a", label: "Order Service", category: "service" },
      { id: "b", label: "Product Service", category: "service" },
      { id: "db1", label: "Order DB", sublabel: "Aurora PostgreSQL", category: "database" },
      { id: "db2", label: "Product DB", sublabel: "DynamoDB", category: "database" },
      { id: "q", label: "Event Queue", sublabel: "SQS", category: "queue" },
    ],
    edges: [
      { from: "gw", to: "a" },
      { from: "gw", to: "b" },
      { from: "a", to: "db1", label: "Read/Write" },
      { from: "b", to: "db2", label: "Read/Write" },
      { from: "b", to: "q", label: "Publish Event", kind: "async" },
    ],
    groups: [
      { id: "vpc", label: "AWS VPC", contains: ["gw", "a", "b", "db1", "db2", "q"], style: "vpc" },
    ],
  };

  test("same-layer nodes share a center and routes stay orthogonal", async () => {
    const p = await layoutDiagram(spec, sketchTheme);
    const center = (id: string) => p.positions[id]!.x + p.positions[id]!.width / 2;
    expect(Math.abs(center("db1") - center("db2"))).toBeLessThan(0.01);
    expect(Math.abs(center("db2") - center("q"))).toBeLessThan(0.01);

    for (const route of Object.values(p.edgeRoutes)) {
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1]!;
        const b = route.points[i]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }
  });
});

describe("two-phase fold layout", () => {
  // GitHub-architecture shape: a chain of 4 groups + a loose user node. The
  // single-run layered layout draws this as a ~4.5:1 ribbon; the fold layout
  // must stack side-branches into columns and land near TARGET_ASPECT.
  const spec: DiagramSpec = {
    type: "system-design",
    title: "GitHub Internal Architecture",
    nodes: [
      { id: "user", label: "User/Client", category: "user" },
      { id: "lb", label: "Load Balancer", category: "gateway" },
      { id: "frontend", label: "Web Frontend", sublabel: "UI, Dashboard", category: "service" },
      { id: "gateway", label: "API Gateway", sublabel: "REST/GraphQL API", category: "gateway" },
      { id: "core", label: "Core Services", sublabel: "Repo, User, Webhook", category: "service" },
      { id: "mq", label: "Message Queue", sublabel: "Kafka", category: "queue" },
      { id: "worker", label: "Worker Services", sublabel: "Background Jobs", category: "service" },
      { id: "search", label: "Search Service", sublabel: "Elasticsearch", category: "service" },
      { id: "git", label: "Git Storage", sublabel: "Repository Data", category: "storage" },
      { id: "cache", label: "Cache", sublabel: "Redis, Memcached", category: "cache" },
      { id: "db", label: "Database", sublabel: "PostgreSQL, MySQL", category: "database" },
    ],
    edges: [
      { from: "user", to: "lb", label: "Requests" },
      { from: "lb", to: "frontend", label: "Traffic" },
      { from: "frontend", to: "gateway", label: "Internal API" },
      { from: "lb", to: "gateway", label: "External API" },
      { from: "gateway", to: "core", label: "Invoke" },
      { from: "core", to: "git", label: "Read/Write" },
      { from: "core", to: "cache", label: "Cache" },
      { from: "core", to: "db", label: "Read/Write" },
      { from: "core", to: "mq", label: "Events", kind: "async" },
      { from: "mq", to: "worker", label: "Tasks", kind: "async" },
      { from: "worker", to: "db", label: "Update" },
      { from: "core", to: "search", label: "Index" },
    ],
    groups: [
      { id: "entry", label: "Entry & API Layer", contains: ["lb", "frontend", "gateway"] },
      { id: "corelogic", label: "Core Application Logic", contains: ["core"] },
      { id: "async", label: "Async & Search", contains: ["mq", "worker", "search"] },
      { id: "persistence", label: "Data Persistence Layer", contains: ["git", "cache", "db"] },
    ],
  };

  test("folds a group chain into a compact grid with clean routes", async () => {
    const p = await layoutDiagram(spec, classicTheme);
    const boxes = [...Object.values(p.positions), ...Object.values(p.groupBoxes)];
    const width = Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x));
    const height =
      Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y));
    // single-run layout is ~4.5:1 — the fold must do meaningfully better
    expect(width / height).toBeLessThan(2.6);

    // every edge routed, orthogonal, finite
    expect(Object.keys(p.edgeRoutes).length).toBe(p.edges.length);
    for (const route of Object.values(p.edgeRoutes)) {
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1]!;
        const b = route.points[i]!;
        expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }

    // nodes stay inside their group box
    for (const group of spec.groups!) {
      const gb = p.groupBoxes[group.id]!;
      for (const id of group.contains) {
        const n = p.positions[id]!;
        expect(n.x).toBeGreaterThanOrEqual(gb.x);
        expect(n.y).toBeGreaterThanOrEqual(gb.y);
        expect(n.x + n.width).toBeLessThanOrEqual(gb.x + gb.width);
        expect(n.y + n.height).toBeLessThanOrEqual(gb.y + gb.height);
      }
    }

    // groups never overlap each other
    const gbs = Object.values(p.groupBoxes);
    for (let i = 0; i < gbs.length; i++) {
      for (let j = i + 1; j < gbs.length; j++) {
        const a = gbs[i]!;
        const b = gbs[j]!;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }

    const rendered = renderToExcalidraw(p, {}, classicTheme);
    expect(allFinite(rendered.skeletons)).toBe(true);
  });

  test("strategy option forces single-run layout", async () => {
    const single = await layoutDiagram(spec, classicTheme, { strategy: "single" });
    const boxes = [...Object.values(single.positions), ...Object.values(single.groupBoxes)];
    const width = Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x));
    const height =
      Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y));
    expect(width / height).toBeGreaterThan(3); // the old ribbon shape
  });
});

test("corridor dedupe leaves every corridor a labelled edge", async () => {
  // b loses its label to a (shared target d), so it must not also be holding
  // the representative slot for its own source corridor, otherwise c is
  // stripped too and the b/c fan ends up with no label at all.
  const spec: DiagramSpec = {
    type: "system-design",
    title: "Shared Corridors",
    nodes: ["src", "hub", "d", "e"].map((id) => ({
      id,
      label: id.toUpperCase(),
      category: "service" as const,
    })),
    edges: [
      { id: "a", from: "src", to: "d", label: "HTTPS" },
      { id: "b", from: "hub", to: "d", label: "HTTPS" },
      { id: "c", from: "hub", to: "e", label: "HTTPS" },
    ],
  };
  const { edges } = await layoutDiagram(spec, classicTheme);
  const labelled = edges.filter((e) => e.label).map((e) => e.id);
  expect(labelled).toEqual(["a", "c"]);
});

test("sketch theme: icon-less node renders label INSIDE its box", async () => {
  const spec: DiagramSpec = {
    type: "system-design",
    title: "Fallback Test",
    nodes: [
      { id: "api", label: "API Server", category: "service" },
      { id: "db", label: "Postgres", category: "database" },
    ],
    edges: [{ from: "api", to: "db", label: "SQL" }],
  };
  const positioned = await layoutDiagram(spec, sketchTheme);
  const rendered = renderToExcalidraw(positioned, {}, sketchTheme);
  const box = rendered.skeletons.find((s) => s.kind === "container" && s.id === "api");
  const label = rendered.skeletons.find((s) => s.kind === "text" && s.id === "api-label");
  if (box?.kind !== "container" || label?.kind !== "text") throw new Error("missing api node");
  expect(label.y).toBeGreaterThan(box.y);
  expect(label.y).toBeLessThan(box.y + box.height);
});

describe("place, polish, route", () => {
  const center = (b: { x: number; y: number; width: number; height: number }) => ({
    x: b.x + b.width / 2,
    y: b.y + b.height / 2,
  });

  test("swimlanes: full-width bands in spec order, flow runs along them", async () => {
    const spec: DiagramSpec = {
      type: "bpmn",
      title: "Lanes",
      nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: `Step ${id}` })),
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
        { from: "c", to: "a", label: "retry" },
      ],
      groups: [
        { id: "emp", label: "Employee", contains: ["a", "b", "d"], style: "swimlane" },
        { id: "mgr", label: "Manager", contains: ["c"], style: "swimlane" },
      ],
    };
    const p = await layoutDiagram(spec, classicTheme);
    const [emp, mgr] = [p.groupBoxes.emp!, p.groupBoxes.mgr!];
    expect(emp.width).toBe(mgr.width);
    expect(mgr.y).toBeGreaterThanOrEqual(emp.y + emp.height);
    // Authored order is run order: the retry is the back edge, not the flow.
    const xs = ["a", "b", "c", "d"].map((id) => center(p.positions[id]!).x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
  });

  test("swimlane nodes clear a wrapped lane title", async () => {
    const spec: DiagramSpec = {
      type: "bpmn",
      title: "Lanes",
      nodes: ["a", "b"].map((id) => ({ id, label: `Step ${id}` })),
      edges: [{ from: "a", to: "b" }],
      groups: [
        {
          id: "ops",
          label: "Operations",
          sublabel: "Night shift and weekend on-call rota",
          contains: ["a"],
          style: "swimlane",
        },
        { id: "fin", label: "Finance", contains: ["b"], style: "swimlane" },
      ],
    };
    const p = await layoutDiagram(spec, sketchTheme);
    const title = containerTitleBox(spec.groups![0]!, sketchTheme);
    expect(title.lines.length).toBe(2);
    // The renderer draws the title at box.y + 12.
    expect(p.positions.a!.y).toBeGreaterThan(p.groupBoxes.ops!.y + 12 + title.height);
  });

  test("replication does not rank the replica after the primary", async () => {
    const spec: DiagramSpec = {
      type: "cloud-architecture",
      title: "Mirror",
      nodes: ["api1", "db1", "api2", "db2"].map((id) => ({ id, label: id })),
      edges: [
        { from: "api1", to: "db1" },
        { from: "api2", to: "db2" },
        { from: "db1", to: "db2", kind: "replication" },
      ],
      groups: [
        { id: "primary", label: "Primary", contains: ["api1", "db1"], style: "region" },
        { id: "replica", label: "Replica", contains: ["api2", "db2"], style: "region" },
      ],
    };
    const p = await layoutDiagram(spec, classicTheme);
    expect(Math.abs(center(p.positions.db1!).x - center(p.positions.db2!).x)).toBeLessThan(40);
  });

  test("a push back to a client keeps the client at the start of the flow", async () => {
    const spec: DiagramSpec = {
      type: "system-design",
      title: "Push",
      nodes: [
        { id: "app", label: "Mobile App", category: "client" },
        { id: "gw", label: "Gateway", category: "gateway" },
        { id: "svc", label: "Orders", category: "service" },
        { id: "push", label: "Notifier", category: "service" },
      ],
      edges: [
        { from: "app", to: "gw" },
        { from: "gw", to: "svc" },
        { from: "svc", to: "push" },
        { from: "push", to: "app", label: "push" },
      ],
    };
    const p = await layoutDiagram(spec, classicTheme);
    const x = (id: string) => center(p.positions[id]!).x;
    expect(x("app")).toBeLessThan(x("gw"));
    expect(x("gw")).toBeLessThan(x("svc"));
    expect(x("svc")).toBeLessThan(x("push"));
  });

  test("a replica fed only by replication ranks after its primaries", async () => {
    const spec: DiagramSpec = {
      type: "system-design",
      title: "DR",
      nodes: ["gw", "a", "b", "dbA", "dbB", "dr"].map((id) => ({ id, label: id })),
      edges: [
        { from: "gw", to: "a" },
        { from: "gw", to: "b" },
        { from: "a", to: "dbA" },
        { from: "b", to: "dbB" },
        { from: "dbA", to: "dr", kind: "replication" },
        { from: "dbB", to: "dr", kind: "replication" },
      ],
    };
    const p = await layoutDiagram(spec, classicTheme);
    const x = (id: string) => center(p.positions[id]!).x;
    expect(x("dr")).toBeGreaterThan(Math.max(x("dbA"), x("dbB")));
  });

  test("group boxes fit their titles, LR and TB, single-run and fold", async () => {
    const groups = [
      {
        id: "g1",
        label: "Ingestion Pipeline",
        sublabel: "Workers on EKS spot fleet",
        contains: ["a", "b"],
      },
      {
        id: "g2",
        label: "Primary Region Persistence",
        sublabel: "Read/Write Cluster",
        contains: ["c", "d"],
      },
    ];
    // The zone case is the one elkjs gets wrong in TB (eclipse/elk#1033): nested compounds.
    for (const zones of [undefined, [{ id: "z", label: "Region", contains: ["g1", "g2"] }]])
      for (const direction of ["LR", "TB"] as const)
        for (const strategy of ["single", "two-phase"] as const) {
          const spec: DiagramSpec = {
            type: "system-design",
            title: "Titles",
            nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id })),
            edges: [
              { from: "a", to: "b" },
              { from: "b", to: "c" },
              { from: "c", to: "d" },
            ],
            groups,
            zones,
            meta: { direction },
          };
          const p = await layoutDiagram(spec, sketchTheme, { strategy });
          for (const g of groups) {
            const title = containerTitleBox(g, sketchTheme);
            const box = p.groupBoxes[g.id]!;
            expect(box.width).toBeGreaterThanOrEqual(title.width + 28);
            // Long "label - sublabel" titles wrap instead of stretching the box to one line.
            expect(title.lines).toEqual([g.label, g.sublabel]);
            expect(box.width).toBeLessThan(480);
            // A box widened for its title centres its children, it does not pin them left.
            const kids = g.contains.map((id) => p.positions[id]!);
            const left = Math.min(...kids.map((k) => k.x));
            const right = Math.max(...kids.map((k) => k.x + k.width));
            expect(Math.abs((left + right) / 2 - (box.x + box.width / 2))).toBeLessThan(6);
          }
        }
  });

  test("a long chain wraps instead of becoming a ribbon", async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const spec: DiagramSpec = {
      type: "system-design",
      title: "Chain",
      nodes: ids.map((id) => ({ id, label: `Service ${id}`, category: "service" })),
      edges: ids.slice(1).map((id, i) => ({ from: ids[i]!, to: id, label: "calls next" })),
    };
    const p = await layoutDiagram(spec, sketchTheme);
    const boxes = Object.values(p.positions);
    const width = Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x));
    const height =
      Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y));
    expect(width / height).toBeLessThan(4);
  });

  test("layers inside a group keep the root layer spacing", async () => {
    const spec: DiagramSpec = {
      type: "system-design",
      title: "Spacing",
      nodes: ["a", "b"].map((id) => ({ id, label: id })),
      edges: [{ from: "a", to: "b" }],
      groups: [{ id: "g", label: "G", contains: ["a", "b"] }],
    };
    const p = await layoutDiagram(spec, classicTheme);
    const [a, b] = [p.positions.a!, p.positions.b!];
    expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(100);
  });
});
