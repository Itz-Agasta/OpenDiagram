/**
 * Rewrites `text/*` file parts (the chat panel's pasted-text attachments) into
 * plain text parts, before `convertToModelMessages`.
 *
 * Passing them through as file parts breaks BYOK on OpenAI and OpenRouter:
 * `@ai-sdk/openai` 4.0.22 throws `UnsupportedFunctionalityError("file part
 * media type text/plain")` for anything but images and PDF. A text part works
 * on every provider and costs the same tokens.
 *
 * Throws on a part it cannot decode instead of dropping it: Claude Desktop's
 * long-paste attachments reached the model empty with no error on either side,
 * and a 400 is the honest answer.
 * https://github.com/anthropics/claude-code/issues/82590
 */
export function inlineTextFiles<T extends { parts?: unknown }>(messages: T[]): T[] {
  return messages.map((message) => {
    if (!Array.isArray(message.parts) || !message.parts.some(isTextFile)) return message;
    return {
      ...message,
      parts: message.parts.map((part) =>
        isTextFile(part)
          ? {
              type: "text",
              // The closing tag is escaped in the body so a paste cannot end the
              // element early (an HTML log, or that literal string).
              text: `<pasted_text name="${(part.filename ?? "Pasted text").replaceAll('"', "'")}">\n${decodeDataUrl(part.url).replaceAll("</pasted_text>", "<\\/pasted_text>")}\n</pasted_text>`,
            }
          : part,
      ),
    };
  });
}

type TextFilePart = { type: "file"; mediaType: string; url: string; filename?: string };

function isTextFile(part: unknown): part is TextFilePart {
  const candidate = part as Partial<TextFilePart> | null;
  return (
    candidate?.type === "file" &&
    typeof candidate.mediaType === "string" &&
    candidate.mediaType.startsWith("text/")
  );
}

function decodeDataUrl(url: unknown) {
  const match = typeof url === "string" ? /^data:[^,]*?(;base64)?,(.*)$/.exec(url) : null;
  if (!match) throw new Error("A pasted-text attachment is not a data URL.");
  const [, base64, payload = ""] = match;
  if (!base64) return decodeURIComponent(payload);
  // Strict on both counts: Buffer.from skips bad base64 characters and the
  // default decoder swaps bad bytes for U+FFFD, either of which would hand
  // the model a quietly corrupted paste.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) throw new Error("Malformed pasted-text attachment.");
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(payload, "base64"));
}
