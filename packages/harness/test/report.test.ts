/** The layout report: metrics, diagnostics, and the golden-score corpus. */
import { describe, expect, test } from "bun:test";
import {
  buildReport,
  classicTheme,
  layoutDiagram,
  sketchTheme,
  type DiagramSpec,
} from "../src/index.js";
import { cloneIconInstance } from "../src/renderer/icons.js";

describe("report", () => {
  // A shape the generator produces constantly: one group of backends plus a
  // few loose front-door nodes. Single-run ELK draws it as a wide ribbon, so
  // it exercises EXTREME_ASPECT while staying clean on the hard defects.
  const blog: DiagramSpec = {
    type: "system-design",
    title: "Blogging Application Architecture",
    nodes: [
      { id: "fe", label: "Web/Mobile Frontend", category: "user" },
      { id: "gw", label: "API Gateway", category: "gateway" },
      { id: "cdn", label: "CDN", category: "gateway" },
      { id: "user", label: "User Service", category: "service" },
      { id: "post", label: "Post Service", category: "service" },
      { id: "comment", label: "Comment Service", category: "service" },
      { id: "es", label: "Elasticsearch", sublabel: "Search Service", category: "service" },
      { id: "pg", label: "PostgreSQL DB", category: "database" },
      { id: "redis", label: "Redis Cache", category: "cache" },
    ],
    edges: [
      { from: "fe", to: "gw", label: "API Requests · HTTPS" },
      { from: "fe", to: "cdn", label: "Serve Assets · HTTPS" },
      { from: "gw", to: "es", label: "Search Queries" },
      { from: "gw", to: "user", label: "Auth/User API" },
      { from: "gw", to: "post", label: "Post API" },
      { from: "gw", to: "comment", label: "Comment API" },
      { from: "user", to: "pg", label: "Read/Write Users" },
      { from: "post", to: "es", label: "Index Posts", kind: "async" },
      { from: "post", to: "pg", label: "Read/Write Posts" },
      { from: "post", to: "redis", label: "Cache Posts" },
      { from: "comment", to: "pg", label: "Read/Write Comments" },
      { from: "comment", to: "redis", label: "Cache Comments" },
    ],
    groups: [
      {
        id: "backend",
        label: "Backend Services",
        contains: ["user", "post", "comment", "es", "pg", "redis"],
        style: "cluster",
      },
    ],
  };

  test("every edge is routed and no node overlaps another", async () => {
    const report = buildReport(await layoutDiagram(blog, classicTheme));
    expect(report.metrics.unrouted).toBe(0);
    expect(report.metrics.nodeOverlaps).toBe(0);
    expect(report.diagnostics.filter((d) => d.code === "UNROUTED_EDGE")).toHaveLength(0);
  });

  test("diagnostics name real spec ids, never coordinates", async () => {
    const report = buildReport(await layoutDiagram(blog, classicTheme));
    const known = new Set([
      ...blog.nodes.map((n) => n.id),
      ...Object.keys((await layoutDiagram(blog, classicTheme)).edgeRoutes),
    ]);
    for (const d of report.diagnostics) {
      for (const subject of d.subjects) expect(known.has(subject)).toBe(true);
    }
  });

  test("scoring is deterministic and penalises a known-bad layout", async () => {
    const a = buildReport(await layoutDiagram(blog, classicTheme));
    const b = buildReport(await layoutDiagram(blog, classicTheme));
    expect(a.score).toBe(b.score);
    // This spec is the wide-ribbon case: it must be flagged, not scored clean.
    expect(a.metrics.aspect).toBeGreaterThan(2.6);
    expect(a.diagnostics.some((d) => d.code === "EXTREME_ASPECT")).toBe(true);
    expect(a.score).toBeLessThan(100);
  });

  test("a clean small layout scores at or near the top", async () => {
    const simple: DiagramSpec = {
      type: "system-design",
      title: "Two Node",
      nodes: [
        { id: "api", label: "API", category: "service" },
        { id: "db", label: "Postgres", category: "database" },
      ],
      edges: [{ from: "api", to: "db", label: "SQL" }],
    };
    const report = buildReport(await layoutDiagram(simple, classicTheme));
    expect(report.metrics.crossings).toBe(0);
    expect(report.metrics.edgeThroughNode).toBe(0);
    expect(report.score).toBeGreaterThanOrEqual(95);
  });
});

describe("golden-score corpus", () => {
  // Real specs lifted from evlog. Floors sit a few points under the measured
  // score: tuning should not break the suite, a regression should. The score
  // aggregates, so icon centring, label wrapping, corridor dedupe and ELK
  // options all land here, none of which broke a unit test while broken.
  //
  // Regenerate floors with: buildReport(await layoutDiagram(spec, theme)).score
  const corpus: {
    title: string;
    minScore: number;
    spec: DiagramSpec;
  }[] = require("./fixtures/corpus.json");

  describe.each(corpus)("$title", ({ minScore, spec }) => {
    test.each([classicTheme, sketchTheme])(`scores at least ${minScore} ($id)`, async (theme) => {
      const report = buildReport(await layoutDiagram(spec, theme));
      expect(report.score).toBeGreaterThanOrEqual(minScore);
    });

    // Never acceptable at any score: a dropped edge, stacked nodes, or an edge
    // drawn straight through an unrelated node.
    test.each([classicTheme, sketchTheme])("has no hard defects ($id)", async (theme) => {
      const { metrics } = buildReport(await layoutDiagram(spec, theme));
      expect(metrics.unrouted).toBe(0);
      expect(metrics.nodeOverlaps).toBe(0);
      expect(metrics.edgeThroughNode).toBe(0);
    });
  });
});

test("icon artwork centres on its ink, not on x+width", () => {
  // A linear element's `width` need not match the span of its `points`, and the
  // points may be negative. Measuring the bbox as `x .. x + width` put 184 of
  // 302 registry icons off-centre, the worst by 51.9px inside an 88px box.
  // This icon is that shape: a line whose ink reaches 40px LEFT of its own x.
  const icon = [
    { id: "r", type: "rectangle", x: 0, y: 0, width: 40, height: 40 },
    {
      id: "l",
      type: "line",
      x: 40,
      y: 20,
      width: 40,
      height: 0,
      points: [
        [0, 0],
        [-40, 0],
      ],
    },
  ];
  const cloned = cloneIconInstance(icon as never[], { x: 0, y: 0, width: 88, height: 88 }, "g", 0);

  const xs = cloned.flatMap((el) => {
    const e = el as { x: number; width: number; points?: [number, number][] };
    return e.points?.length ? e.points.map(([px]) => e.x + px) : [e.x, e.x + e.width];
  });
  const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
  expect(Math.abs(centre - 44)).toBeLessThan(0.01);
});
