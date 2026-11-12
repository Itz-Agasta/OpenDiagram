import type { PositionedSpec, Theme } from "@OpenDiagram/harness";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { AiUsage } from "../../quota/enforce";
import { aiTelemetry } from "../../telemetry";
import { picture } from "./view";

/**
 * The agent's own before/after look: both pictures in a random order, pick the
 * one that reads better. The harness judge only blocks hard faults, so this is
 * what stops a fix that is valid but uglier (measured: without it 4 to 5 of 20
 * fixes read worse to a blind judge).
 */
export async function compare(
  model: LanguageModel,
  providerOptions: Parameters<typeof generateText>[0]["providerOptions"],
  start: PositionedSpec,
  fixed: PositionedSpec,
  request: string | undefined,
  usage: Required<AiUsage>,
  theme: Theme,
): Promise<"fix" | "start"> {
  const flip = Math.random() < 0.5;
  const [one, two] = flip ? [fixed, start] : [start, fixed];
  const { output, usage: spent } = await generateText({
    model,
    providerOptions,
    telemetry: aiTelemetry("diagram-fix-check"),
    output: Output.object({ schema: z.object({ better: z.enum(["1", "2"]) }) }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Two drawings of the same diagram, same content, different arrangement. Which one would a reader find cleaner and easier to follow? Look at arrows that hug, loop or cross needlessly, labels on boxes, wasted space, overall size, and whether the reading order follows the flow.${request ? ` The user asked for:\n"""\n${request.slice(0, 2000)}\n"""\nA placement or direction the user asked for must be honoured.` : ""}`,
          },
          { type: "text", text: "Drawing 1:" },
          { type: "file", data: picture(one, theme), mediaType: "image/png" },
          { type: "text", text: "Drawing 2:" },
          { type: "file", data: picture(two, theme), mediaType: "image/png" },
        ],
      },
    ],
    maxOutputTokens: 4096,
    abortSignal: AbortSignal.timeout(60_000),
  });
  usage.inputTokens += spent.inputTokens ?? 0;
  usage.outputTokens += spent.outputTokens ?? 0;
  usage.cachedInputTokens += spent.inputTokenDetails.cacheReadTokens ?? 0;
  return (output.better === "1") === flip ? "fix" : "start";
}

/**
 * The first look, for a drawing whose numbers look fine: one call with the
 * picture, "does this need polish?". Cheap next to a fix (one image in, a few
 * tokens out) and the only gate that sees what the score cannot.
 */
export async function triage(
  model: LanguageModel,
  providerOptions: Parameters<typeof generateText>[0]["providerOptions"],
  drawn: PositionedSpec,
  request: string | undefined,
  usage: Required<AiUsage>,
  theme: Theme,
): Promise<{ polish: boolean; problems: string }> {
  const { output, usage: spent } = await generateText({
    model,
    providerOptions,
    telemetry: aiTelemetry("diagram-fix-triage"),
    output: Output.object({
      schema: z.object({
        problems: z.string().describe("what looks off, by node or edge id; empty if nothing"),
        polish: z.boolean(),
      }),
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `A diagram as drawn; ids are printed in grey (nodes, groups) and orange (edges). Would a careful designer move boxes before shipping it? Say yes only for things a reader notices at a glance: arrows that hug, loop or cross needlessly, run along frame borders, labels on boxes or borders, a node stranded far from what it connects to, large empty areas, a reading order that fights the flow, a size that will not read on one screen. Small nits are no.${request ? ` The user asked for:\n"""\n${request.slice(0, 2000)}\n"""` : ""}`,
          },
          { type: "file", data: picture(drawn, theme), mediaType: "image/png" },
        ],
      },
    ],
    maxOutputTokens: 2048,
    abortSignal: AbortSignal.timeout(30_000),
  });
  usage.inputTokens += spent.inputTokens ?? 0;
  usage.outputTokens += spent.outputTokens ?? 0;
  usage.cachedInputTokens += spent.inputTokenDetails.cacheReadTokens ?? 0;
  return output;
}
