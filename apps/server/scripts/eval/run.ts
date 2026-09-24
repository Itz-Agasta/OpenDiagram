/**
 * Model bake-off for the diagram agent. Runs the production system prompt,
 * tools, and layout against every model x prompt x run, through OpenRouter so
 * one key covers every vendor. Writes one JSON line per turn plus the drawn
 * spec, then prints a per-model summary.
 *
 *   OPENROUTER_API_KEY=... bun scripts/eval/run.ts --models a,b --runs 2 [--prompts x,y]
 *
 * Run from apps/server so the server env loads.
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createGoogle } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { themes } from "@OpenDiagram/harness";
import { isStepCount, streamText, type ModelMessage, type StepResult, type ToolSet } from "ai";
import type { RequestLogger } from "evlog";
import { buildCanvasContext, buildSystemPrompt } from "../../src/lib/agent/prompt";
import { createCachingFetch } from "../../src/lib/agent/cache";
import { repairDrawDiagramInput } from "../../src/lib/agent/chat-stream";
import { askUserTool, createDrawDiagramTool } from "../../src/lib/agent/tools";
import { prompts, type EvalPrompt } from "./prompts";
import { summarize } from "./summary";

const { values: args } = parseArgs({
  options: {
    models: { type: "string" },
    prompts: { type: "string" },
    runs: { type: "string", default: "1" },
    concurrency: { type: "string", default: "6" },
    out: { type: "string", default: "scripts/eval/out" },
  },
});

if (!args.models) throw new Error("--models is required");
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";

/**
 * `gemini:<id>` goes straight to Google on the platform key with production's
 * explicit cache, priced here since Google returns no cost. Standard tier,
 * 2026 intro prices. https://ai.google.dev/gemini-api/docs/pricing
 */
const GEMINI_PRICES: Record<string, [input: number, cached: number, output: number]> = {
  "gemini-3.8-flash": [0.75, 0.075, 3.75],
  "gemini-3.7-flash": [0.75, 0.075, 3.75],
  "gemini-3.5-flash-lite": [0.3, 0.03, 2.5],
  "gemini-2.5-flash": [0.3, 0.03, 2.5],
};

function resolveModel(slug: string, host?: string, effort?: string) {
  if (slug.startsWith("gemini:")) {
    const id = slug.slice("gemini:".length);
    const google = createGoogle({ apiKey: googleKey, fetch: createCachingFetch(googleKey, id) });
    return {
      model: google(id),
      providerOptions: effort
        ? { google: { thinkingConfig: { thinkingLevel: effort } } }
        : undefined,
    };
  }
  return {
    model: openrouter.chat(slug, {
      usage: { include: true },
      ...(effort && { reasoning: { effort: effort as "low" } }),
      ...(host && { provider: { order: [host], allow_fallbacks: false } }),
    }),
    providerOptions: undefined,
  };
}
const models = args.models.split(",");
const chosen = args.prompts
  ? prompts.filter((p) => args.prompts!.split(",").includes(p.id))
  : prompts;
const outDir = join(args.out, new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(join(outDir, "specs"), { recursive: true });
const resultsPath = join(outDir, "results.jsonl");

/** Collects what the draw tool `log.set`s: score, diagnostics, counts. */
function stubLogger(): { log: RequestLogger; fields: Record<string, unknown> } {
  const fields: Record<string, unknown> = {};
  const warnings: string[] = [];
  const log = {
    set: (f: Record<string, unknown>) => Object.assign(fields, f),
    warn: (message: string) => warnings.push(message),
    error: (e: unknown) => warnings.push(String(e)),
    info: () => {},
  } as unknown as RequestLogger;
  fields.warnings = warnings;
  return { log, fields };
}

function coverage(prompt: EvalPrompt, spec: Record<string, unknown> | undefined): number | null {
  if (!prompt.expect.length) return null;
  if (!spec) return 0;
  const text = JSON.stringify(spec).toLowerCase();
  // Word-start match, so "eta" does not score inside "metadata"; stems like "retriev" still work.
  const hits = prompt.expect.filter((k) =>
    k.split("|").some((alt) => new RegExp(`\\b${alt}`).test(text)),
  );
  return hits.length / prompt.expect.length;
}

/** `vendor/model[@Host][#effort]`: pin one OpenRouter host, set reasoning effort. */
async function runOne(modelId: string, prompt: EvalPrompt, run: number) {
  const [, slug = modelId, host, effort] = /^([^@#]+)(?:@([^#]+))?(?:#(.+))?$/.exec(modelId) ?? [];
  const { log, fields } = stubLogger();
  const tools = {
    ask_user: askUserTool,
    draw_diagram: createDrawDiagramTool(log, themes.sketch, []),
  };
  const started = performance.now();
  const steps: StepResult<ToolSet>[] = [];
  let error: string | undefined;
  let text = "";
  let repairs = 0;
  const messages: ModelMessage[] = [
    { role: "user", content: buildCanvasContext([]) },
    { role: "user", content: prompt.text },
  ];
  try {
    // A second turn only when the model asked: answer with its first option, as a
    // user clicking the first chip would. ask_user has no execute, so the SDK stops there.
    for (let turn = 0; turn < 2; turn++) {
      const result = streamText({
        ...resolveModel(slug, host, effort),
        instructions: buildSystemPrompt(),
        messages,
        tools,
        stopWhen: isStepCount(6),
        maxOutputTokens: 16384,
        maxRetries: 2,
        abortSignal: AbortSignal.timeout(240_000),
        // Same repair as production, so a model's score isn't sunk by a fixable key typo.
        // Counted separately: a repair is still a fidelity miss.
        experimental_repairToolCall: async ({ toolCall }) => {
          if (toolCall.toolName !== "draw_diagram") return null;
          const repaired = repairDrawDiagramInput(toolCall.input);
          if (repaired) repairs++;
          return repaired ? { ...toolCall, input: repaired } : null;
        },
      });
      text += await result.text;
      const turnSteps = await result.steps;
      steps.push(...turnSteps);
      const ask = turnSteps.at(-1)?.toolCalls.find((t) => t.toolName === "ask_user");
      if (!ask) break;
      const answer = (ask.input as { options?: string[] }).options?.[0] ?? "Your call";
      messages.push(...(await result.response).messages, {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: ask.toolCallId,
            toolName: "ask_user",
            output: { type: "text", value: answer },
          },
        ],
      });
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const ms = Math.round(performance.now() - started);

  const draws = steps.flatMap((s) => s.toolCalls.filter((t) => t.toolName === "draw_diagram"));
  const toolErrors = steps.flatMap((s) =>
    s.content.filter((c) => c.type === "tool-error" && c.toolName === "draw_diagram"),
  ).length;
  const drewOk = steps.some((s) =>
    s.content.some((c) => c.type === "tool-result" && c.toolName === "draw_diagram"),
  );
  const lastDraw = draws.at(-1)?.input as Record<string, unknown> | undefined;
  const geminiPrice = GEMINI_PRICES[slug.replace("gemini:", "")];
  const cost = steps.reduce((sum, s) => {
    if (geminiPrice) {
      const cached = s.usage.inputTokenDetails.cacheReadTokens ?? 0;
      const fresh = (s.usage.inputTokens ?? 0) - cached;
      const [i, c, o] = geminiPrice;
      return sum + (fresh * i + cached * c + (s.usage.outputTokens ?? 0) * o) / 1e6;
    }
    const usage = (s.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)
      ?.usage;
    return sum + (usage?.cost ?? 0);
  }, 0);
  const sum = (pick: (s: StepResult<ToolSet>) => number | undefined) =>
    steps.reduce((acc, s) => acc + (pick(s) ?? 0), 0);

  const file = `${modelId.replace(/[/:@#]/g, "_")}__${prompt.id}__${run}`;
  if (lastDraw)
    writeFileSync(join(outDir, "specs", `${file}.json`), JSON.stringify(lastDraw, null, 2));

  const diagram = (fields.diagram ?? {}) as Record<string, unknown>;
  const row = {
    model: modelId,
    prompt: prompt.id,
    run,
    drewOk,
    askedUser: steps.some((s) => s.toolCalls.some((t) => t.toolName === "ask_user")),
    finishReason: steps.at(-1)?.finishReason,
    steps: steps.length,
    drawCalls: draws.length,
    toolErrors,
    repairs,
    error,
    ms,
    cost,
    inputTokens: sum((s) => s.usage.inputTokens),
    cachedTokens: sum((s) => s.usage.inputTokenDetails.cacheReadTokens),
    outputTokens: sum((s) => s.usage.outputTokens),
    reasoningTokens: sum((s) => s.usage.outputTokenDetails.reasoningTokens),
    nodes: diagram.nodeCount,
    edges: diagram.edgeCount,
    score: diagram.score,
    diagnostics: diagram.diagnostics,
    coverage: coverage(prompt, lastDraw),
    textChars: text.length,
    spec: lastDraw ? `specs/${file}.json` : undefined,
  };
  appendFileSync(resultsPath, `${JSON.stringify(row)}\n`);
  console.log(
    `${drewOk ? "ok " : "NO "} ${modelId.padEnd(40)} ${prompt.id.padEnd(16)} #${run} ${(ms / 1000).toFixed(1)}s $${cost.toFixed(4)} score=${row.score ?? "-"} cov=${row.coverage?.toFixed(2) ?? "-"}${error ? ` ERR ${error.slice(0, 80)}` : ""}`,
  );
  return row;
}

const jobs = models.flatMap((m) =>
  chosen.flatMap((p) => Array.from({ length: Number(args.runs) }, (_, r) => () => runOne(m, p, r))),
);
const rows: Awaited<ReturnType<typeof runOne>>[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: Number(args.concurrency) }, async () => {
    while (next < jobs.length) rows.push(await jobs[next++]!());
  }),
);
console.log(`\n${summarize(rows)}\nresults: ${resultsPath}`);
// elkjs keeps a worker alive, so the process never exits on its own.
process.exit(0);
