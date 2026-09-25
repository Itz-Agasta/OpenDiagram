import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

// Newlines on both tokens: only a real fence counts, so ``` inside the JSON does
// not end the block early and a "```js" fence followed by "on..." is not "```json".
const OPEN = "```json\n";
const CLOSE = "\n```";

/** Length of the longest tail of `text` that could still become `token`. */
function partialTail(text: string, token: string): number {
  for (let k = Math.min(token.length - 1, text.length); k > 0; k--)
    if (token.startsWith(text.slice(-k))) return k;
  return 0;
}

/**
 * Drops fenced ```json blocks from the reply text. Gemini sometimes drafts the
 * draw tool's arguments as one before making the real call (1 of 16 live
 * replies on 2026-09-24, 0 of 117 eval turns), which put ~7k chars of JSON in
 * the chat and in stored history. Other code fences pass through. Deltas split
 * fences anywhere, so up to 7 chars are held back until the next delta decides.
 *
 * FIXME(gemini-field-fidelity): the tokens are still generated and billed; this
 * only hides them. `onStrip` feeds `chat.jsonBlocksStripped`, keep it measured.
 */
export function stripJsonBlocks<TOOLS extends ToolSet>(
  onStrip: () => void,
): StreamTextTransform<TOOLS> {
  return () => {
    const texts = new Map<string, { pending: string; dropping: boolean }>();
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(chunk, controller) {
        if (chunk.type === "text-end") {
          const state = texts.get(chunk.id);
          // An unterminated block is dropped with the rest of it.
          if (state?.pending && !state.dropping)
            controller.enqueue({ type: "text-delta", id: chunk.id, text: state.pending });
          texts.delete(chunk.id);
          controller.enqueue(chunk);
          return;
        }
        if (chunk.type !== "text-delta") {
          controller.enqueue(chunk);
          return;
        }
        const state = texts.get(chunk.id) ?? { pending: "", dropping: false };
        texts.set(chunk.id, state);
        let rest = state.pending + chunk.text;
        let out = "";
        for (;;) {
          const token = state.dropping ? CLOSE : OPEN;
          const at = rest.indexOf(token);
          if (at === -1) break;
          if (!state.dropping) {
            out += rest.slice(0, at);
            onStrip();
          }
          rest = rest.slice(at + token.length);
          state.dropping = !state.dropping;
        }
        const hold = partialTail(rest, state.dropping ? CLOSE : OPEN);
        if (!state.dropping) out += rest.slice(0, rest.length - hold);
        state.pending = rest.slice(rest.length - hold);
        if (out) controller.enqueue({ ...chunk, text: out });
      },
    });
  };
}
