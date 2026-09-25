/**
 * Eval for the diagram agent. Runs a strategy's system prompt and tools (see
 * strategies.ts; s0 is production) with the production layout against every
 * model x prompt x run. `gemini:<id>` goes direct to Google on the platform key,
 * anything else through OpenRouter. Writes one JSON line per turn plus the
 * drawn specs, then prints a per-model summary.
 *
 *   bun scripts/eval/run.ts --models 'gemini:gemini-3.8-flash#low' --strategy s0 --runs 2 [--prompts x,y]
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
import { buildCanvasContext } from "../../src/lib/agent/prompt";
import { createCachingFetch } from "../../src/lib/agent/cache";
import { repairToolInput } from "../../src/lib/agent/chat-stream";
import { coverage, echoedLabels, leaks, looseCoverage, sentences, stuffed } from "./metrics";
import { prompts, type EvalPrompt } from "./prompts";
import { strategies } from "./strategies";
import { summarize } from "./summary";

const { values: args } = parseArgs({
  options: {
    models: { type: "string" },
    prompts: { type: "string" },
    runs: { type: "string", default: "1" },
    strategy: { type: "string", default: "s0" },
    concurrency: { type: "string", default: "6" },
    out: { type: "string", default: "scripts/eval/out" },
  },
});

if (!args.models) throw new Error("--models is required");
const strategy = strategies[args.strategy!];
if (!strategy) throw new Error(`unknown --strategy ${args.strategy}`);
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

/** Collects what each draw `log.set`s (score, diagnostics, counts), one entry per draw. */
function stubLogger(): {
  log: RequestLogger;
  fields: Record<string, unknown>;
  draws: Record<string, unknown>[];
} {
  const fields: Record<string, unknown> = {};
  const draws: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  const log = {
    set: (f: Record<string, unknown>) => {
      // draw_system logs its views as one set.
      const diagram = f.diagram as { views?: Record<string, unknown>[] } | undefined;
      if (diagram) draws.push(...(diagram.views ?? [diagram]));
      Object.assign(fields, f);
    },
    warn: (message: string) => warnings.push(message),
    error: (e: unknown) => warnings.push(String(e)),
    info: () => {},
  } as unknown as RequestLogger;
  fields.warnings = warnings;
  return { log, fields, draws };
}

/** `vendor/model[@Host][#effort]`: pin one OpenRouter host, set reasoning effort. */
async function runOne(modelId: string, prompt: EvalPrompt, run: number) {
  const [, slug = modelId, host, effort] = /^([^@#]+)(?:@([^#]+))?(?:#(.+))?$/.exec(modelId) ?? [];
  const { log, draws: drawLogs } = stubLogger();
  const tools = strategy.tools(log, themes.sketch);
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
        instructions: strategy.instructions,
        messages,
        tools,
        stopWhen: isStepCount(6),
        maxOutputTokens: 16384,
        maxRetries: 2,
        abortSignal: AbortSignal.timeout(240_000),
        // Same repair as production, so a model's score isn't sunk by a fixable key typo.
        // Counted separately: a repair is still a fidelity miss.
        experimental_repairToolCall: async ({ toolCall }) => {
          const repaired = repairToolInput(toolCall.toolName, toolCall.input);
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

  const toolErrors = steps.flatMap((s) =>
    s.content.filter((c) => c.type === "tool-error" && c.toolName.startsWith("draw_")),
  ).length;
  const drewOk = steps.some((s) =>
    s.content.some(
      (c) =>
        c.type === "tool-result" && (c.toolName === "draw_diagram" || c.toolName === "draw_system"),
    ),
  );
  // Every successful draw of the turn: S2 may draw several views, draw_system returns its planned ones.
  const drawn = steps.flatMap((s) =>
    s.content.flatMap((c) => {
      if (c.type !== "tool-result") return [];
      if (c.toolName === "draw_diagram") return [c.input as Record<string, unknown>];
      if (c.toolName === "draw_system")
        return (c.output as { views: { spec: Record<string, unknown> }[] }).views.map(
          (v) => v.spec,
        );
      return [];
    }),
  );
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

  const file = `${modelId.replace(/[/:@#]/g, "_")}~${args.strategy}__${prompt.id}__${run}`;
  if (drawn.length)
    writeFileSync(
      join(outDir, "specs", `${file}.json`),
      JSON.stringify(drawn.length === 1 ? drawn[0] : { views: drawn }, null, 2),
    );
  // The draw_system input, so view planning can be replayed offline without the LLM.
  const model = steps.flatMap((s) => s.toolCalls).find((t) => t.toolName === "draw_system")?.input;
  if (model)
    writeFileSync(join(outDir, "specs", `${file}.model.json`), JSON.stringify(model, null, 2));
  // Plan = text up to and including the draw step; reply = text after the last draw.
  const draws = (s: StepResult<ToolSet>) => s.toolCalls.some((t) => t.toolName.startsWith("draw_"));
  const first = steps.findIndex(draws);
  const last = steps.findLastIndex(draws);
  const planText =
    first < 0
      ? ""
      : steps
          .slice(0, first + 1)
          .map((s) => s.text)
          .join("");
  const replyText =
    last < 0
      ? ""
      : steps
          .slice(last + 1)
          .map((s) => s.text)
          .join("");
  writeFileSync(
    join(outDir, "specs", `${file}.text.json`),
    JSON.stringify({ plan: planText, reply: replyText }, null, 2),
  );
  const scores = drawLogs.flatMap((d) => (typeof d.score === "number" ? [d.score] : []));
  const row = {
    model: `${modelId}~${args.strategy}`,
    prompt: prompt.id,
    run,
    drewOk,
    askedUser: steps.some((s) => s.toolCalls.some((t) => t.toolName === "ask_user")),
    finishReason: steps.at(-1)?.finishReason,
    steps: steps.length,
    drawCalls: steps.flatMap((s) => s.toolCalls.filter((t) => t.toolName.startsWith("draw_")))
      .length,
    toolErrors,
    repairs,
    error,
    ms,
    cost,
    inputTokens: sum((s) => s.usage.inputTokens),
    cachedTokens: sum((s) => s.usage.inputTokenDetails.cacheReadTokens),
    outputTokens: sum((s) => s.usage.outputTokens),
    reasoningTokens: sum((s) => s.usage.outputTokenDetails.reasoningTokens),
    views: drawn.length,
    nodes: drawLogs.reduce((a, d) => a + ((d.nodeCount as number) ?? 0), 0) || undefined,
    edges: drawLogs.reduce((a, d) => a + ((d.edgeCount as number) ?? 0), 0) || undefined,
    // Worst view, not the mean: one broken frame is what the user notices.
    score: scores.length ? Math.min(...scores) : undefined,
    diagnostics: drawLogs.flatMap((d) => (d.diagnostics as string[]) ?? []),
    coverage: coverage(prompt, drawn),
    looseCoverage: looseCoverage(prompt, drawn),
    leaks: leaks(prompt, drawn),
    stuffed: stuffed(drawn),
    textChars: text.length,
    planSentences: sentences(planText),
    planChars: planText.length,
    replyChars: replyText.length,
    echoedLabels: echoedLabels(drawn, replyText),
    // Raw model: production strips these (strip-json-text.ts), the eval does not.
    jsonDrafted: text.includes("```json"),
    spec: drawn.length ? `specs/${file}.json` : undefined,
  };
  appendFileSync(resultsPath, `${JSON.stringify(row)}\n`);
  console.log(
    `${drewOk ? "ok " : "NO "} ${modelId.padEnd(40)} ${prompt.id.padEnd(16)} #${run} ${(ms / 1000).toFixed(1)}s $${cost.toFixed(4)} v=${row.views} n=${row.nodes ?? "-"} score=${row.score ?? "-"} cov=${row.coverage?.toFixed(2) ?? "-"} leak=${row.leaks.length} stuffed=${row.stuffed}${error ? ` ERR ${error.slice(0, 80)}` : ""}`,
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
