/** ELK layout invariants and the two-phase fold. */
import { describe, expect, test } from "bun:test";
import {
  classicTheme,
  layoutDiagram,
  renderToExcalidraw,
  sketchTheme,
  type DiagramSpec,
} from "../src/index.js";
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
