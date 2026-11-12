/**
 * Blind pairwise visual judge for fix.ts output. For every after-render it shows
 * a vision model the user's request and two pictures, start and after, in a
 * random order, and asks which reads better. The judge never sees arm names or
 * scores. Model defaults to a different one than the fixer.
 *
 *   bun scripts/eval/judge.ts --dir <fix out dir> --prompts <prompts.json>
 *
 * Expects <dir>/png/<name>~0.png (start) and <name>~<arm><run>.png (after),
 * as written by scripts/viz/viz-scenes.ts. Appends to <dir>/judge.jsonl.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createGoogle } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

const { values: args } = parseArgs({
  options: {
    dir: { type: "string" },
    prompts: { type: "string" },
    model: { type: "string", default: "gemini-3.1-pro-preview" },
    concurrency: { type: "string", default: "6" },
  },
});
if (!args.dir) throw new Error("--dir is required");
const google = createGoogle({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "" });
const requests = new Map<string, string>(
  args.prompts
    ? (JSON.parse(readFileSync(args.prompts, "utf8")) as { id: string; text: string }[]).map(
        (p) => [p.id, p.text],
      )
    : [],
);
const done = new Set(
  existsSync(join(args.dir, "judge.jsonl"))
    ? readFileSync(join(args.dir, "judge.jsonl"), "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => (JSON.parse(l) as { file: string }).file)
    : [],
);

const PROMPT = `Two renders of the same diagram, picture 1 and picture 2. They have the same content; only the arrangement differs. Judge which one a reader would find cleaner and easier to follow, as a finished diagram for the request below. Look at: arrows that hug, overlap, loop around or cross needlessly; labels on top of boxes or other labels; boxes on a group's title; wasted space or an unreadable size; whether the reading order follows the flow; whether placements the user asked for are honoured. Small differences you would not notice at a glance are "same".`;

const png = join(args.dir, "png");
const jobs = readdirSync(png)
  .filter((f) => !f.endsWith("~0.png") && f.endsWith(".png") && !done.has(f))
  .map((file) => async () => {
    const name = file.split("~")[0]!;
    const after = readFileSync(join(png, file));
    const before = readFileSync(join(png, `${name}~0.png`));
    const flip = Math.random() < 0.5;
    const [one, two] = flip ? [after, before] : [before, after];
    const request = requests.get(name.replace(/-v\d+$/, "")) ?? "(not recorded)";
    const { output } = await generateText({
      model: google(args.model!),
      output: Output.object({
        schema: z.object({
          winner: z.enum(["1", "2", "same"]),
          reason: z.string().describe("one sentence"),
        }),
      }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `${PROMPT}\n\nREQUEST:\n"""\n${request.slice(0, 3000)}\n"""` },
            { type: "text", text: "Picture 1:" },
            { type: "file", data: one, mediaType: "image/png" },
            { type: "text", text: "Picture 2:" },
            { type: "file", data: two, mediaType: "image/png" },
          ],
        },
      ],
      maxRetries: 3,
      abortSignal: AbortSignal.timeout(180_000),
    });
    const afterIs = flip ? "1" : "2";
    const verdict =
      output.winner === "same" ? "same" : output.winner === afterIs ? "better" : "worse";
    appendFileSync(
      join(args.dir!, "judge.jsonl"),
      `${JSON.stringify({ file, name, tag: file.split("~")[1]!.replace(".png", ""), verdict, reason: output.reason })}\n`,
    );
    console.log(`${verdict.padEnd(6)} ${file}  ${output.reason}`);
  });

console.log(`${jobs.length} to judge`);
let next = 0;
await Promise.all(
  Array.from({ length: Number(args.concurrency) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      await job().catch((e) => console.log(`JUDGE FAIL ${String(e).slice(0, 200)}`));
    }
  }),
);
process.exit(0);
