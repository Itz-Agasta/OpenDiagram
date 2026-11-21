import { MockLanguageModelV4 } from "ai/test";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

/** 10 in, 5 out per call: tests add these up to check the usage ledger. */
export const CALL_USAGE = { input: 10, output: 5 };

type Turn =
  | { tool: string; input: unknown }
  | { text: string }
  | { json: unknown }
  | { throws: string };

function result(turn: Exclude<Turn, { throws: string }>): GenerateResult {
  const content =
    "tool" in turn
      ? [
          {
            type: "tool-call" as const,
            toolCallId: `call-${turn.tool}`,
            toolName: turn.tool,
            input: JSON.stringify(turn.input),
          },
        ]
      : [{ type: "text" as const, text: "json" in turn ? JSON.stringify(turn.json) : turn.text }];
  return {
    content,
    finishReason: { unified: "tool" in turn ? "tool-calls" : "stop", raw: undefined },
    usage: {
      inputTokens: {
        total: CALL_USAGE.input,
        noCache: CALL_USAGE.input,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: CALL_USAGE.output, text: CALL_USAGE.output, reasoning: undefined },
    },
    warnings: [],
  };
}

/**
 * A model that answers each call with the next scripted turn: a tool call, a
 * text reply, a JSON object (for `Output.object` calls), or an error. Running
 * out of turns is a test bug and throws.
 */
export function scriptedModel(turns: Turn[]): MockLanguageModelV4 {
  const queue = [...turns];
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const turn = queue.shift();
      if (!turn) throw new Error("scripted model ran out of turns");
      if ("throws" in turn) throw new Error(turn.throws);
      return result(turn);
    },
  });
}

/** An evlog logger that records warnings and drops everything else. */
export function quietLog() {
  const warnings: string[] = [];
  const log = {
    warnings,
    warn: (message: string) => void warnings.push(message),
    set: () => {},
    info: () => {},
    error: () => {},
  };
  return log;
}
