import type { DiagramEdge, DiagramNode, DiagramSpec } from "../../src/index.js";

/**
 * Synthetic stress specs: shapes that have broken layout before or that the
 * generator emits often. Never real user prompts. Each one is snapshotted in
 * snapshots/stress.test.ts, so a change to any of them is a reviewed diff.
 */
type Cat = NonNullable<DiagramNode["category"]>;
const n = (
  id: string,
  label: string,
  category: Cat = "service",
  sublabel?: string,
): DiagramNode => ({
  id,
  label,
  category,
  ...(sublabel ? { sublabel } : {}),
});
const e = (from: string, to: string, label?: string, kind?: DiagramEdge["kind"]): DiagramEdge => ({
  from,
  to,
  ...(label ? { label } : {}),
  ...(kind ? { kind } : {}),
});
const spec = (
  title: string,
  s: Omit<DiagramSpec, "title" | "type"> & Partial<DiagramSpec>,
): DiagramSpec => ({
  type: "system-design",
  title,
  ...s,
});

const fanOut = spec("Fan out", {
  nodes: [
    n("gw", "API Gateway", "gateway"),
    ...["Users", "Orders", "Payments", "Search", "Catalog", "Reviews", "Shipping", "Notify"].map(
      (x) => n(x.toLowerCase(), `${x} Service`),
    ),
  ],
  edges: ["users", "orders", "payments", "search", "catalog", "reviews", "shipping", "notify"].map(
    (x) => e("gw", x, "REST"),
  ),
});

const deepChain = spec("Deep chain", {
  nodes: Array.from({ length: 10 }, (_, i) => n(`s${i}`, `Stage ${i + 1}`)),
  edges: Array.from({ length: 9 }, (_, i) =>
    e(`s${i}`, `s${i + 1}`, i % 3 === 0 ? "Batch" : undefined),
  ),
});

const fanIn = spec("Fan in", {
  nodes: [
    ...Array.from({ length: 6 }, (_, i) => n(`p${i}`, `Producer ${i + 1}`)),
    n("q", "Event Bus", "queue", "Kafka"),
    ...Array.from({ length: 3 }, (_, i) => n(`c${i}`, `Consumer ${i + 1}`, "function")),
  ],
  edges: [
    ...Array.from({ length: 6 }, (_, i) => e(`p${i}`, "q", "Publish", "async")),
    ...Array.from({ length: 3 }, (_, i) => e("q", `c${i}`, "Consume", "async")),
  ],
});

const cycle = spec("Cycle", {
  nodes: ["a", "b", "c", "d", "e"].map((x) => n(x, `Service ${x.toUpperCase()}`)),
  edges: [
    e("a", "b", "Call"),
    e("b", "c"),
    e("c", "d", "Notify"),
    e("d", "a", "Retry"),
    e("a", "c"),
    e("e", "b"),
  ],
});

const nested = spec("Nested zones", {
  nodes: [
    n("user", "Mobile App", "client"),
    n("cdn", "CDN", "gateway", "CloudFront"),
    n("alb", "Load Balancer", "gateway"),
    n("api", "API Service"),
    n("worker", "Worker", "function"),
    n("db", "Orders DB", "database", "Aurora"),
    n("cache", "Cache", "cache", "Redis"),
  ],
  edges: [
    e("user", "cdn", "HTTPS"),
    e("cdn", "alb"),
    e("alb", "api"),
    e("api", "db", "SQL"),
    e("api", "cache", "Read"),
    e("api", "worker", "Jobs", "async"),
    e("worker", "db", "Write"),
  ],
  groups: [
    { id: "public", label: "Public Subnet", contains: ["alb"], style: "subnet" },
    {
      id: "private",
      label: "Private Subnet",
      contains: ["api", "worker", "db", "cache"],
      style: "subnet",
    },
  ],
  zones: [
    { id: "region", label: "us-east-1", contains: ["public", "private"], style: "aws-region" },
  ],
});

// Regression: alignColumns snapped a member onto its group's title (TB, two groups).
const tbTwoGroups = spec("TB two groups", {
  nodes: [
    n("a", "Cache"),
    n("b", "Cache"),
    n("c", "Cache"),
    n("t", "Order Processing Service With A Long Name", "service", "Handles checkout and payments"),
  ],
  edges: [e("a", "b"), e("a", "c")],
  groups: [
    { id: "g0", label: "Core", contains: ["a", "b"] },
    { id: "g1", label: "Orders", contains: ["t"] },
  ],
  meta: { direction: "TB" },
});

// Regression: the replication chip printed over both databases.
const replica = spec("Replica", {
  nodes: [
    n("app", "Order Service"),
    n("pri", "Orders DB", "database", "Primary"),
    n("rep", "Orders DB", "database", "Read Replica"),
  ],
  edges: [
    e("app", "pri", "Write"),
    e("app", "rep", "Read"),
    e("pri", "rep", "Async Replication", "replication"),
  ],
  meta: { direction: "TB" },
});

const swimlanes = spec("Swimlanes", {
  type: "flowchart",
  nodes: [
    n("order", "Place Order", "user"),
    n("pay", "Take Payment"),
    n("check", "Fraud Check"),
    n("pick", "Pick Items"),
    n("ship", "Ship Parcel"),
  ],
  edges: [e("order", "pay"), e("pay", "check"), e("check", "pick", "Approved"), e("pick", "ship")],
  groups: [
    { id: "customer", label: "Customer", contains: ["order"], style: "swimlane" },
    { id: "finance", label: "Finance", contains: ["pay", "check"], style: "swimlane" },
    { id: "warehouse", label: "Warehouse", contains: ["pick", "ship"], style: "swimlane" },
  ],
});

// 40 nodes: 5 groups of 6 chained internally, plus 10 loose nodes, cross links.
const big = (() => {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const groups = Array.from({ length: 5 }, (_, g) => {
    const ids = Array.from({ length: 6 }, (_, i) => `g${g}n${i}`);
    ids.forEach((id, i) => nodes.push(n(id, `Svc ${g}.${i}`, i === 5 ? "database" : "service")));
    ids.slice(1).forEach((id, i) => edges.push(e(ids[i]!, id, i === 0 ? "Call" : undefined)));
    return { id: `g${g}`, label: `Domain ${g + 1}`, contains: ids };
  });
  for (let i = 0; i < 10; i++)
    nodes.push(n(`x${i}`, `Edge ${i + 1}`, i < 3 ? "client" : "external"));
  for (let g = 0; g < 5; g++) {
    edges.push(e(`x${g}`, `g${g}n0`, "HTTPS"));
    if (g < 4) edges.push(e(`g${g}n2`, `g${g + 1}n1`, "Event", "async"));
    edges.push(e(`g${g}n4`, `x${g + 5}`));
  }
  return spec("Forty nodes", { nodes, edges, groups });
})();

const longLabels = spec("Long labels", {
  nodes: [
    n(
      "a",
      "Customer Identity and Access Management Service",
      "service",
      "OAuth 2.0 and OpenID Connect provider",
    ),
    n(
      "b",
      "Internationalization Localization Translation Worker",
      "function",
      "Runs every fifteen minutes",
    ),
    n(
      "c",
      "Supercalifragilisticexpialidocious Analytics Warehouse",
      "database",
      "Columnar storage",
    ),
  ],
  edges: [
    e("a", "b", "Publishes locale change events"),
    e("b", "c", "Writes translated strings nightly"),
  ],
});

const erd = spec("Shop schema", {
  type: "erd",
  nodes: [
    {
      id: "user",
      label: "users",
      columns: [
        { name: "id", type: "uuid", key: "pk" },
        { name: "email", type: "text" },
      ],
    },
    {
      id: "order",
      label: "orders",
      columns: [
        { name: "id", type: "uuid", key: "pk" },
        { name: "user_id", type: "uuid", key: "fk" },
        { name: "total", type: "numeric" },
      ],
    },
    {
      id: "item",
      label: "order_items",
      columns: [
        { name: "order_id", type: "uuid", key: "fk" },
        { name: "product_id", type: "uuid", key: "fk" },
      ],
    },
    {
      id: "product",
      label: "products",
      columns: [
        { name: "id", type: "uuid", key: "pk" },
        { name: "name", type: "text" },
      ],
    },
  ],
  edges: [
    { from: "user", to: "order", cardinality: "one-to-many" },
    { from: "order", to: "item", cardinality: "one-to-many" },
    { from: "product", to: "item", cardinality: "one-to-many" },
  ],
});

const flowTB = spec("Checkout flow", {
  type: "flowchart",
  nodes: [
    { id: "start", label: "Cart", shape: "ellipse" },
    { id: "auth", label: "Signed in?", shape: "diamond" },
    { id: "login", label: "Log in" },
    { id: "pay", label: "Pay" },
    { id: "ok", label: "Paid?", shape: "diamond" },
    { id: "done", label: "Confirmation", shape: "ellipse" },
    { id: "fail", label: "Show error" },
  ],
  edges: [
    e("start", "auth"),
    e("auth", "pay", "Yes"),
    e("auth", "login", "No"),
    e("login", "pay"),
    e("pay", "ok"),
    e("ok", "done", "Yes", "success"),
    e("ok", "fail", "No", "error"),
  ],
  meta: { direction: "TB" },
});

const kinds = spec("Edge kinds", {
  nodes: [
    n("web", "Web", "client"),
    n("api", "API"),
    n("db", "DB", "database"),
    n("dr", "DR DB", "database"),
  ],
  edges: [
    e("web", "api", "Request"),
    e("api", "web", "Response"),
    e("api", "db", "Query"),
    e("db", "dr", "Replicate", "replication"),
    e("api", "dr", "Failover", "error"),
  ],
});

const grid = spec("Arranged grid", {
  nodes: ["a", "b", "c", "d", "e", "f"].map((x) => n(x, `Node ${x.toUpperCase()}`)),
  edges: [e("a", "b"), e("b", "c"), e("d", "e"), e("e", "f"), e("a", "d", "Sync")],
  groups: [{ id: "top", label: "Top Row", contains: ["a", "b", "c"] }],
  meta: {
    arrange: {
      rows: [
        ["a", "b", "c"],
        ["d", "e", "f"],
      ],
    },
  },
});

const ring = spec("Hub ring", {
  nodes: [
    n("hub", "Message Hub", "queue"),
    ...["A", "B", "C", "D", "E", "F"].map((x) => n(x, `Client ${x}`, "client")),
  ],
  edges: ["A", "B", "C", "D", "E", "F"].map((x) => e(x, "hub", "Subscribe", "async")),
  meta: { arrange: { center: "hub" } },
});

/** Laid out by layoutDiagram. */
export const stress: Record<string, DiagramSpec> = {
  fanOut,
  deepChain,
  fanIn,
  cycle,
  nested,
  tbTwoGroups,
  replica,
  swimlanes,
  big,
  longLabels,
  erd,
  flowTB,
  kinds,
  grid,
  ring,
};

/** Laid out by renderSequenceDiagram, which builds its own grid. */
export const sequence: DiagramSpec = {
  type: "sequence",
  title: "Login",
  nodes: [
    n("user", "User", "user"),
    n("web", "Web App", "client"),
    n("auth", "Auth Service"),
    n("db", "User DB", "database"),
  ],
  edges: [
    { id: "m1", from: "user", to: "web", label: "Submit credentials" },
    { id: "m2", from: "web", to: "auth", label: "POST /login" },
    { id: "m3", from: "auth", to: "db", label: "Find user" },
    { id: "m4", from: "db", to: "auth", label: "Row" },
    { id: "m5", from: "auth", to: "web", label: "Token" },
    { id: "m6", from: "auth", to: "web", label: "401", kind: "error" },
    { id: "m7", from: "web", to: "user", label: "Dashboard" },
  ],
  groups: [
    {
      id: "alt",
      label: "alt",
      contains: ["m5", "m6"],
      sections: [
        { label: "valid", startsAt: "m5" },
        { label: "invalid", startsAt: "m6" },
      ],
    },
  ],
};
