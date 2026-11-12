/**
 * Triage-rate check: lays out every saved spec, keeps the ones whose numbers look
 * fine (score 70+, no hard faults, under 3 lints), asks the fixer's first look
 * whether each needs polish, and saves scenes for a look.
 *
 *   bun scripts/eval/triage.ts <outDir> <specsDir...> [--prompts <prompts.json>]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGoogle } from "@ai-sdk/google";
import {
  hardFaults,
  layoutDiagram,
  layoutLints,
  renderToExcalidraw,
  themes,
  type DiagramSpec,
} from "@OpenDiagram/harness";
import { layoutCost } from "../../src/lib/agent/fix/view";
import { triage } from "../../src/lib/agent/fix/self-check";
import { iconRegistry, normalizeSpecIcons } from "../../src/lib/icons/registry";
const google = createGoogle({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "" });
const argv = process.argv.slice(2);
const flag = argv.indexOf("--prompts");
const promptsFile = flag >= 0 ? argv.splice(flag, 2)[1] : undefined;
const [out, ...dirs] = argv;
if (!out || dirs.length === 0)
  throw new Error("usage: triage.ts <outDir> <specsDir...> [--prompts f]");
mkdirSync(out, { recursive: true });
const prompts = new Map(
  promptsFile
    ? (JSON.parse(readFileSync(promptsFile, "utf8")) as { id: string; text: string }[]).map((p) => [
        p.id,
        p.text,
      ])
    : [],
);
const theme = themes.sketch;
const rows: unknown[] = [];
let errors = 0;
const jobs: (() => Promise<void>)[] = [];
for (const d of dirs)
  for (const f of readdirSync(d).filter(
    (f) => f.endsWith(".json") && !/\.(model|text)\.json$/.test(f),
  )) {
    const raw = JSON.parse(readFileSync(join(d, f), "utf8"));
    const views: DiagramSpec[] = raw.views ?? [raw];
    views.forEach((v, i) =>
      jobs.push(async () => {
        // Same population as the fixer, which skips sequences and diagrams under 3 nodes.
        if (v.type === "sequence" || v.nodes.length < 3) return;
        const spec = normalizeSpecIcons<DiagramSpec>(v).spec;
        const p = await layoutDiagram(spec, theme);
        const cost = layoutCost(p, theme),
          hard = hardFaults(p, theme),
          lints = layoutLints(p, theme).length;
        if (cost < 70 || hard > 0 || lints >= 3) return;
        // id looks the prompt up; key names the scene, unique across runs in one dir.
        const id = f.replace(/^.*__(.+)__\d+\.json$/, "$1") + (views.length > 1 ? `-v${i}` : "");
        const key = f.replace(/\.json$/, "") + (views.length > 1 ? `-v${i}` : "");
        const usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
        const t = await triage(
          google("gemini-3.8-flash"),
          { google: { thinkingConfig: { thinkingLevel: "low" } } },
          p,
          prompts.get(id.replace(/-v\d+$/, "")),
          usage,
          theme,
        ).catch((e: unknown) => ({ error: String(e) }));
        // A failed call is not a "no": counting it as one would bias the rate down.
        if ("error" in t) {
          errors++;
          console.log(`ERR ${key} ${t.error.slice(0, 140)}`);
          return;
        }
        rows.push({ id, key, cost, polish: t.polish, problems: t.problems });
        writeFileSync(
          join(out!, `${key}.json`),
          JSON.stringify(renderToExcalidraw(p, iconRegistry, theme)),
        );
        console.log(
          `${t.polish ? "YES" : "no "} ${id.padEnd(26)} ${cost} ${t.problems.slice(0, 140)}`,
        );
      }),
    );
  }
let n = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (n < jobs.length) await jobs[n++]!();
  }),
);
writeFileSync(join(out!, "triage.json"), JSON.stringify(rows, null, 1));
if (errors) console.log(`${errors} calls failed and are not counted`);
process.exit(errors ? 1 : 0);
