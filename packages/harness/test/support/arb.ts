import fc from "fast-check";
import type { DiagramEdge, DiagramNode, DiagramSpec } from "../../src/index.js";

/** Run count and seed: fixed in CI, `FC_RUNS` / `FC_SEED` to explore locally. */
export const fcParams = (numRuns: number) => ({
  numRuns: Number(process.env.FC_RUNS ?? numRuns),
  seed: Number(process.env.FC_SEED ?? 20261122),
});

const CATEGORIES = [
  "service",
  "database",
  "queue",
  "gateway",
  "client",
  "external",
  "storage",
  "cache",
  "function",
  "user",
] as const;
const KINDS = ["sync", "async", "replication", "error", "success"] as const;

// Words as a model writes them, plus accents, CJK and long tokens that do not wrap.
const word = fc.oneof(
  fc.stringMatching(/^[A-Za-z][a-z]{1,11}$/),
  fc.constantFrom("API", "DB", "Café", "Zürich", "日本語", "S3", "gRPC", "v2"),
  fc.stringMatching(/^[A-Za-z]{18,30}$/),
);
const label = fc.array(word, { minLength: 1, maxLength: 6 }).map((w) => w.join(" "));
// Edge labels stay short, as the model writes them ("Read/Write", "Publish
// Event"). A 100-character chip has no free spot anywhere near a dense
// diagram; that limit is the FIXME in router/labels.ts, not an invariant.
const edgeLabel = fc
  .array(
    fc.oneof(fc.stringMatching(/^[A-Za-z][a-z]{1,9}$/), fc.constantFrom("API", "gRPC", "HTTPS")),
    {
      minLength: 1,
      maxLength: 4,
    },
  )
  .map((w) => w.join(" "));

/**
 * A system-design spec the generator could plausibly emit: 2-14 nodes, edges
 * between distinct nodes (cycles allowed, at most one edge per pair so
 * reciprocal merging never fires), up to 3 flat groups and a zone over groups.
 */
export const specArb: fc.Arbitrary<DiagramSpec> = fc
  .integer({ min: 2, max: 14 })
  .chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);
    const node = (id: string) =>
      fc
        .record({
          label,
          sublabel: fc.option(label, { nil: undefined }),
          category: fc.constantFrom(...CATEGORIES),
        })
        .map((r): DiagramNode => ({ id, ...r }));
    const pair = fc.tuple(fc.nat(n - 1), fc.nat(n - 1)).filter(([a, b]) => a !== b);
    const edges = fc.uniqueArray(pair, {
      maxLength: Math.min(2 * n, 24),
      selector: ([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`),
    });
    return fc.record({
      nodes: fc.tuple(...ids.map(node)),
      edges,
      edgeLabels: fc.array(fc.option(edgeLabel, { nil: undefined }), {
        minLength: 24,
        maxLength: 24,
      }),
      edgeKinds: fc.array(fc.constantFrom(...KINDS), { minLength: 24, maxLength: 24 }),
      // Per node: which group it joins, -1 for none.
      membership: fc.array(fc.integer({ min: -1, max: 2 }), { minLength: n, maxLength: n }),
      zone: fc.boolean(),
      direction: fc.constantFrom(undefined, "LR", "TB"),
    });
  })
  .map(({ nodes, edges, edgeLabels, edgeKinds, membership, zone, direction }) => {
    const groups = [0, 1, 2]
      .map((g) => ({
        id: `g${g}`,
        label: `Group ${g}`,
        contains: nodes.filter((_, i) => membership[i] === g).map((x) => x.id),
      }))
      .filter((g) => g.contains.length > 0);
    const spec: DiagramSpec = {
      type: "system-design",
      title: "Random",
      nodes: [...nodes],
      edges: edges.map(([a, b], i): DiagramEdge => ({
        id: `e${i}`,
        from: `n${a}`,
        to: `n${b}`,
        label: edgeLabels[i],
        kind: edgeKinds[i],
      })),
      groups,
      zones:
        zone && groups.length > 0
          ? [{ id: "z0", label: "Region", contains: groups.map((g) => g.id) }]
          : undefined,
      meta: direction ? { direction } : undefined,
    };
    return spec;
  });
