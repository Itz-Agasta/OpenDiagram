/**
 * Harness smoke suite — run with `bun test` from packages/harness.
 *
 * Covers the full deterministic pipeline (no LLM, no browser): sequence
 * diagrams (fragments, numbering, status colors), ERD (entity sizing,
 * crow-foot), ELK layout invariants (orthogonal routes, column alignment),
 * and theme fallbacks. Run this after ANY harness change — it catches the
 * geometry regressions that type-checking can't.
 */
import { describe, expect, test } from "bun:test";
import {
  classicTheme,
  layoutDiagram,
  renderSequenceDiagram,
  renderToExcalidraw,
  sketchTheme,
  type DiagramSpec,
  type RenderSkeleton,
} from "../src/index.js";

function allFinite(skeletons: RenderSkeleton[]): boolean {
  return skeletons.every((s) => {
    const nums = Object.values(s).filter((v): v is number => typeof v === "number");
    const pts = s.kind === "arrow" ? s.points.flat() : [];
    return [...nums, ...pts].every((n) => Number.isFinite(n));
  });
}

const seqSpec: DiagramSpec = {
  type: "sequence",
  title: "OAuth Login",
  nodes: [
    { id: "browser", label: "Browser" },
    { id: "web", label: "Web App", sublabel: "Next.js" },
    { id: "auth", label: "Auth Service" },
    { id: "db", label: "Database", category: "database" },
  ],
  edges: [
    { from: "browser", to: "web", label: "POST /login" },
    { id: "val", from: "web", to: "auth", label: "validate token" },
    { id: "ok", from: "auth", to: "web", label: "valid", kind: "success" },
    { id: "bad", from: "auth", to: "web", label: "401 Unauthorized", kind: "error" },
    { from: "auth", to: "auth", label: "sign JWT" },
    { from: "web", to: "browser", label: "200 OK", style: "dashed" },
    { from: "ghost", to: "web", label: "bad actor" }, // unknown actor — must be dropped
  ],
  groups: [
    {
      id: "alt1",
      label: "alt — token validation",
      contains: ["val", "ok", "bad"],
      sections: [
        { label: "valid token", startsAt: "ok" },
        { label: "invalid token", startsAt: "bad" },
      ],
    },
  ],
};

describe.each([classicTheme, sketchTheme])("sequence ($id theme)", (theme) => {
  const r = renderSequenceDiagram(seqSpec, theme);
  const arrows = r.skeletons.filter((s) => s.kind === "arrow");

  test("drops unknown actors with a warning", () => {
    expect(r.warnings.some((w) => w.includes("ghost"))).toBe(true);
  });

  test("emits 4 lifelines + 6 messages + 2 section dividers", () => {
    expect(arrows.length).toBe(12);
  });

  test("all coordinates finite", () => {
    expect(allFinite(r.skeletons)).toBe(true);
  });

  test("frame wraps every skeleton", () => {
    const frame = r.skeletons.find((s) => s.kind === "frame");
    expect(frame?.kind).toBe("frame");
    if (frame?.kind === "frame") expect(frame.children.length).toBe(r.skeletons.length - 1);
  });

  test("messages auto-number when more than 3", () => {
    const lbl = r.skeletons.find((s) => s.kind === "text" && s.id === "val-label");
    expect(lbl?.kind === "text" && lbl.text).toBe("2. validate token");
  });

  test("error red / success green on arrows", () => {
    const bad = arrows.find((a) => a.id === "bad");
    const ok = arrows.find((a) => a.id === "ok");
    expect(bad?.kind === "arrow" && bad.strokeColor).toBe(theme.edge.errorStroke);
    expect(ok?.kind === "arrow" && ok.strokeColor).toBe(theme.edge.successStroke);
  });

  test("fragment box: square, tinted, drawn behind lifelines", () => {
    const fragIdx = r.skeletons.findIndex((s) => s.id === "fragment-alt1");
    const lifeIdx = r.skeletons.findIndex((s) => s.id === "lifeline-browser");
    const frag = r.skeletons[fragIdx];
    expect(fragIdx).toBeGreaterThanOrEqual(0);
    expect(fragIdx).toBeLessThan(lifeIdx);
    expect(frag?.kind === "container" && frag.rounded).toBe(false);
    expect(frag?.kind === "container" && frag.backgroundColor).toBe("#f1f5f9");
  });

  test("alt sections render labels and a divider between branches", () => {
    const divider = r.skeletons.find((s) => s.id === "fragment-alt1-divider-1");
    const s0 = r.skeletons.find((s) => s.kind === "text" && s.id === "fragment-alt1-section-0");
    const ok = arrows.find((a) => a.id === "ok");
    const bad = arrows.find((a) => a.id === "bad");
    expect(s0?.kind === "text" && s0.text).toBe("[valid token]");
    if (divider?.kind === "arrow" && ok?.kind === "arrow" && bad?.kind === "arrow") {
      expect(divider.y).toBeGreaterThan(ok.y);
      expect(divider.y).toBeLessThan(bad.y);
    } else {
      throw new Error("missing divider or branch arrows");
    }
  });

  test("actor boxes repeat at the bottom", () => {
    expect(r.skeletons.some((s) => s.id === "browser-bottom")).toBe(true);
  });
});

test("short sequences skip numbering", () => {
  const short = renderSequenceDiagram(
    { ...seqSpec, edges: seqSpec.edges.slice(0, 2), groups: [] },
    classicTheme,
  );
  const lbl = short.skeletons.find((s) => s.kind === "text" && s.id === "val-label");
  expect(lbl?.kind === "text" && lbl.text).toBe("validate token");
});

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
