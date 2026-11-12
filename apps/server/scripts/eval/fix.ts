/**
 * Fix-loop experiment: take diagrams the harness already drew and run the
 * production fixer (`src/lib/agent/fix`) on them under different options (ARMS).
 * Writes before/after scenes for `scripts/viz/viz-scenes.ts` and one result row
 * per run; `judge.ts` then compares the renders blind.
 *
 *   bun scripts/eval/fix.ts --specs 'scripts/eval/out/<run>/specs' --arms A,D --out <dir>
 *
 * Run from apps/server so the server env loads.
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { createGoogle } from "@ai-sdk/google";
import {
  hardFaults,
  layoutDiagram,
  layoutLints,
  renderToExcalidraw,
  themes,
  type DiagramSpec,
  type PositionedSpec,
} from "@OpenDiagram/harness";
import type { RequestLogger } from "evlog";
import { createLayoutFixer, type FixOptions } from "../../src/lib/agent/fix";
import { layoutCost } from "../../src/lib/agent/fix/view";
import { iconRegistry, normalizeSpecIcons } from "../../src/lib/icons/registry";
import { costMicros } from "../../src/lib/quota/cost-ceiling";

const { values: args } = parseArgs({
  options: {
    specs: { type: "string", multiple: true },
    arms: { type: "string", default: "A,D" },
    out: { type: "string", default: "scripts/eval/out/fix" },
    max: { type: "string", default: "70" },
    // Only drawings scoring at least this: the "numbers look fine" population.
    min: { type: "string", default: "-100000" },
    model: { type: "string", default: "gemini-3.8-flash" },
    effort: { type: "string", default: "low" },
    runs: { type: "string", default: "1" },
    concurrency: { type: "string", default: "4" },
    // JSON array of { id, text }: the user's request per diagram.
    prompts: { type: "string" },
    only: { type: "string" },
    // "i/n": run every n-th job from i, so n processes split the CPU-bound layout work.
    shard: { type: "string", default: "0/1" },
    // Number of the first run, so a later round does not overwrite earlier scenes.
    first: { type: "string", default: "0" },
  },
});
if (!args.specs?.length) throw new Error("--specs is required");
const theme = themes.sketch;
const google = createGoogle({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "" });

const move = ["move"] as FixOptions["tools"];
const all = ["move", "route", "restructure"] as FixOptions["tools"];
/** See notes/engine/agent-canvas-v3-eyes.md for what each arm answers. */
const ARMS: Record<string, FixOptions> = {
  A: { picture: false, tools: move, lints: false, judge: "strict", maxSteps: 6 },
  B: { picture: false, tools: move, lints: true, judge: "hard", maxSteps: 6 },
  C: { picture: true, tools: move, lints: true, judge: "hard", maxSteps: 6 },
  D: { picture: true, tools: all, lints: true, judge: "hard", maxSteps: 6 },
  E: { picture: true, tools: all, lints: true, judge: "strict", maxSteps: 6 },
  // D after the arrange op and the size target landed in the fixer prompt.
  D2: { picture: true, tools: all, lints: true, judge: "hard", maxSteps: 6 },
  // No direction op, no arrange on swimlanes, and the agent's own before/after look.
  C3: { picture: true, tools: move, lints: true, judge: "hard", maxSteps: 6, selfCheck: true },
  // C3 with the judge moved to the end: steps stand, best clean state wins.
  C4: { picture: true, tools: move, lints: true, judge: "end", maxSteps: 6, selfCheck: true },
  D3: { picture: true, tools: all, lints: true, judge: "hard", maxSteps: 6, selfCheck: true },
};
const requests = new Map<string, string>(
  args.prompts
    ? (JSON.parse(readFileSync(args.prompts, "utf8")) as { id: string; text: string }[]).map(
        (p) => [p.id, p.text],
      )
    : [],
);

const scene = (p: PositionedSpec) => renderToExcalidraw(p, iconRegistry, theme);
const labels = (s: DiagramSpec) =>
  [...s.nodes.map((n) => n.label), ...s.edges.flatMap((e) => (e.label ? [e.label] : []))].sort();

async function runOne(
  name: string,
  spec: DiagramSpec,
  laid: PositionedSpec,
  armName: string,
  run: number,
) {
  const usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  let fields: Record<string, unknown> = {};
  const log = {
    set: (f: Record<string, unknown>) => (fields = { ...fields, ...f }),
    warn: (msg: string, f?: unknown) =>
      (fields = { ...fields, warn: `${msg} ${JSON.stringify(f)}` }),
  } as unknown as RequestLogger;
  const fixer = createLayoutFixer(
    google(args.model!),
    theme,
    log,
    usage,
    requests.get(name.replace(/-v\d+$/, "")),
    ARMS[armName]!,
    { google: { thinkingConfig: { thinkingLevel: args.effort } } },
  );
  const started = performance.now();
  const out = await fixer(spec, laid);
  // Content check: every node id and every label text from the start survives.
  const ids = new Set(out.spec.nodes.map((n) => n.id));
  const lostNodes = spec.nodes.filter((n) => !ids.has(n.id)).map((n) => n.id);
  // Multiset: a label that appears twice must still appear twice.
  const left = labels(out.spec);
  const lostLabels = labels(spec).filter((l) => {
    const i = left.indexOf(l);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
  // The fixer hands the start back when it keeps nothing; such pairs are left
  // out of judging, where render jitter alone reads as better or worse.
  const unchanged = out.positioned === laid;
  const row = {
    name,
    arm: armName,
    run,
    nodes: spec.nodes.length,
    edges: spec.edges.length,
    before: layoutCost(laid, theme),
    after: layoutCost(out.positioned, theme),
    hardBefore: hardFaults(laid, theme),
    hardAfter: hardFaults(out.positioned, theme),
    lintsBefore: layoutLints(laid, theme).length,
    lintsAfter: layoutLints(out.positioned, theme).length,
    lostNodes,
    lostLabels,
    fix: fields.fix,
    triage: fields.fixTriage,
    warn: fields.warn,
    unchanged,
    cost:
      costMicros(args.model!, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens) / 1e6,
    ms: Math.round(performance.now() - started),
  };
  appendFileSync(join(args.out!, "results.jsonl"), `${JSON.stringify(row)}\n`);
  writeFileSync(join(args.out!, "scenes", `${name}~0.json`), JSON.stringify(scene(laid)));
  if (!unchanged)
    writeFileSync(
      join(args.out!, "scenes", `${name}~${armName}${run}.json`),
      JSON.stringify(scene(out.positioned)),
    );
  console.log(
    `${armName}${run} ${name.padEnd(26)} ${String(row.before).padStart(5)} -> ${String(row.after).padStart(5)} hard ${row.hardBefore}->${row.hardAfter} lints ${row.lintsBefore}->${row.lintsAfter} ${JSON.stringify(fields.fix ?? {})} $${row.cost.toFixed(4)}${lostNodes.length + lostLabels.length ? " LOST" : ""}${row.warn ? ` WARN ${String(row.warn).slice(0, 120)}` : ""}`,
  );
}

mkdirSync(join(args.out!, "scenes"), { recursive: true });
const jobs: (() => Promise<unknown>)[] = [];
for (const dir of args.specs) {
  for (const file of readdirSync(dir).filter(
    (f) => f.endsWith(".json") && !/\.(model|text)\.json$/.test(f),
  )) {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const specs: DiagramSpec[] = Array.isArray(raw.views) ? raw.views : [raw];
    for (const [i, s] of specs.entries()) {
      if (s.type === "sequence") continue;
      const { spec } = normalizeSpecIcons<DiagramSpec>(s);
      const laid = await layoutDiagram(spec, theme);
      const score = layoutCost(laid, theme);
      if (score > Number(args.max) || score < Number(args.min)) continue;
      const name =
        basename(file, ".json").replace(/^.*__(.+)__\d+$/, "$1") +
        (specs.length > 1 ? `-v${i}` : "");
      if (args.only && !args.only.split(",").includes(name)) continue;
      for (let run = Number(args.first); run < Number(args.first) + Number(args.runs); run++)
        for (const arm of args.arms!.split(","))
          jobs.push(() =>
            runOne(name, spec, laid, arm, run).catch((e) => {
              // A failed run stays in the results, so arm counts are not biased to survivors.
              appendFileSync(
                join(args.out!, "results.jsonl"),
                `${JSON.stringify({ name, arm, run, error: String(e).slice(0, 300) })}\n`,
              );
              console.log(`JOB FAIL ${name} ${arm}${run} ${String(e).slice(0, 200)}`);
            }),
          );
    }
  }
}
const [shard, shards] = args.shard!.split("/").map(Number) as [number, number];
const mine = jobs.filter((_, i) => i % shards === shard);
console.log(`${mine.length} of ${jobs.length} jobs`);
let next = 0;
await Promise.all(
  Array.from({ length: Number(args.concurrency) }, async () => {
    while (next < mine.length) {
      const job = mine[next++]!;
      await job();
    }
  }),
);
process.exit(0);
