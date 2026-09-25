/**
 * Per-model table from results.jsonl rows. Also runnable on a saved file:
 *   bun scripts/eval/summary.ts scripts/eval/out/<run>/results.jsonl
 */
import { readFileSync } from "node:fs";

type Row = {
  model: string;
  drewOk: boolean;
  askedUser: boolean;
  toolErrors: number;
  repairs?: number;
  ms: number;
  cost: number;
  score?: number;
  coverage: number | null;
  leaks?: string[];
  stuffed?: number;
  views?: number;
  planSentences?: number;
  replyChars?: number;
  echoedLabels?: number;
  jsonDrafted?: boolean;
  nodes?: number;
  reasoningTokens: number;
};

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (n: number, digits: number) => (Number.isFinite(n) ? n.toFixed(digits) : "-");

export function summarize(rows: Row[]): string {
  const byModel = Map.groupBy(rows, (r) => r.model);
  const lines = [
    "model | drew | asked | toolErr | repairs | score | coverage | leaks | stuffed | views | plan sent p50/max | reply chars p50 | echoed | json drafted | nodes | p50 s | p95 s | $ avg | $ p95 | reasoning",
    "-- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | --",
  ];
  for (const [model, rs] of byModel) {
    const scores = rs.flatMap((r) => (r.score == null ? [] : [r.score]));
    const covs = rs.flatMap((r) => (r.coverage == null ? [] : [r.coverage]));
    const ms = rs.map((r) => r.ms / 1000);
    const costs = rs.map((r) => r.cost);
    lines.push(
      [
        model,
        `${rs.filter((r) => r.drewOk).length}/${rs.length}`,
        rs.filter((r) => r.askedUser).length,
        rs.reduce((a, r) => a + r.toolErrors, 0),
        rs.reduce((a, r) => a + (r.repairs ?? 0), 0),
        fmt(avg(scores), 0),
        fmt(avg(covs), 2),
        rs.reduce((a, r) => a + (r.leaks?.length ?? 0), 0),
        fmt(avg(rs.flatMap((r) => (r.stuffed == null ? [] : [r.stuffed]))), 1),
        fmt(avg(rs.flatMap((r) => (r.views == null ? [] : [r.views]))), 1),
        (() => {
          const ps = rs.flatMap((r) => (r.planSentences == null ? [] : [r.planSentences]));
          return ps.length ? `${pct(ps, 0.5)}/${Math.max(...ps)}` : "-";
        })(),
        (() => {
          const rc = rs.flatMap((r) => (r.replyChars == null ? [] : [r.replyChars]));
          return rc.length ? fmt(pct(rc, 0.5), 0) : "-";
        })(),
        fmt(avg(rs.flatMap((r) => (r.echoedLabels == null ? [] : [r.echoedLabels]))), 1),
        (() => {
          const known = rs.filter((r) => r.jsonDrafted != null);
          return known.length
            ? `${known.filter((r) => r.jsonDrafted).length}/${known.length}`
            : "-";
        })(),
        fmt(avg(rs.flatMap((r) => (r.nodes == null ? [] : [r.nodes]))), 0),
        pct(ms, 0.5).toFixed(1),
        pct(ms, 0.95).toFixed(1),
        avg(costs).toFixed(4),
        pct(costs, 0.95).toFixed(4),
        fmt(avg(rs.map((r) => r.reasoningTokens)), 0),
      ].join(" | "),
    );
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) throw new Error("usage: summary.ts <results.jsonl>");
  const rows = readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Row);
  console.log(summarize(rows));
}
